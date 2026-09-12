  // ===== Rover-balloon visuals =====
  // Three-part composition:
  //   drawRoverTrail() — reentry flame streak BEHIND/ABOVE the rig at high
  //                      speeds; sampled from roverMode.reentryHistory.
  //   drawRoverFx()    — the balloons themselves (clustered around the rig),
  //                      pop debris during deflate, and impact sparks.

  function drawRoverTrail() {
    var R = roverMode;
    if (!R) return;
    var t = performance.now() / 1000;

    // Reentry flames only really kick in at high speed. The threshold is
    // forgiving so a normal bounce doesn't trigger them; you have to be
    // well into a long fall.
    var fastThresh = 380;
    var speed = Math.abs(player.vy);
    if (speed < fastThresh && R.reentryHistory.length === 0) return;

    // Trailing flame ribbon — drawn from oldest (faintest) to newest
    // (brightest), tapering in width with distance.
    for (var i = 0; i < R.reentryHistory.length; i++) {
      var h = R.reentryHistory[i];
      var lifeP = h.t / 0.4;        // 1 → 0
      var velP = Math.min(1, (h.v - fastThresh) / 600);
      if (velP <= 0) continue;
      var alpha = lifeP * velP;
      // Outer plume (red/orange)
      var w = 14 * velP * (0.4 + lifeP * 0.6);
      var outerGrad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, w);
      outerGrad.addColorStop(0,   'rgba(255,200,80,'  + (alpha * 0.9).toFixed(2) + ')');
      outerGrad.addColorStop(0.4, 'rgba(255,120,40,'  + (alpha * 0.6).toFixed(2) + ')');
      outerGrad.addColorStop(1,   'rgba(180,30,10,0)');
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(h.x, h.y, w, 0, Math.PI * 2);
      ctx.fill();
    }

    // White-hot leading edge — a bright blob just above the player when
    // we're going fast. This is the "impact with the atmosphere" face.
    if (speed >= fastThresh) {
      var velP2 = Math.min(1, (speed - fastThresh) / 600);
      var pcx = player.x + PLAYER_W / 2;
      var pcy = player.y - 4;          // just above the rig top
      // Glow halo
      var gR = 22 + velP2 * 18;
      var gGrad = ctx.createRadialGradient(pcx, pcy, 0, pcx, pcy, gR);
      gGrad.addColorStop(0,   'rgba(255,255,220,' + (0.7 * velP2).toFixed(2) + ')');
      gGrad.addColorStop(0.3, 'rgba(255,180,80,'  + (0.5 * velP2).toFixed(2) + ')');
      gGrad.addColorStop(1,   'rgba(255,80,30,0)');
      ctx.fillStyle = gGrad;
      ctx.beginPath();
      ctx.arc(pcx, pcy, gR, 0, Math.PI * 2);
      ctx.fill();
      // Wispy upward streaks (the actual flame tongues)
      var streakCount = 6 + Math.floor(velP2 * 6);
      for (var sk = 0; sk < streakCount; sk++) {
        var ox = (Math.random() - 0.5) * 18;
        var len = 14 + Math.random() * 22 * velP2;
        var sw = 1.5 + Math.random() * 2.2;
        var sg = ctx.createLinearGradient(pcx + ox, pcy, pcx + ox * 1.3, pcy - len);
        sg.addColorStop(0, 'rgba(255,220,120,' + (0.7 * velP2).toFixed(2) + ')');
        sg.addColorStop(0.5, 'rgba(255,140,60,' + (0.4 * velP2).toFixed(2) + ')');
        sg.addColorStop(1, 'rgba(255,80,30,0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(pcx + ox - sw, pcy);
        ctx.lineTo(pcx + ox + sw, pcy);
        ctx.lineTo(pcx + ox * 1.3 + 0.5, pcy - len);
        ctx.lineTo(pcx + ox * 1.3 - 0.5, pcy - len);
        ctx.closePath();
        ctx.fill();
      }
      // Tiny ember sparks shooting upward
      var emberCount = Math.floor(velP2 * 8);
      for (var em = 0; em < emberCount; em++) {
        var ex = pcx + (Math.random() - 0.5) * 24;
        var ey = pcy - Math.random() * 28;
        ctx.fillStyle = 'rgba(255,230,160,' + (0.6 + Math.random() * 0.4).toFixed(2) + ')';
        ctx.fillRect(ex, ey, 1, 1);
      }
    }
  }

  function drawRoverFx() {
    var R = roverMode;
    if (!R) return;

    // ----- Balloons -----
    // Clustered around the rig center, each with its own jiggle phase.
    // Color is a warm peach-pink so they read as inflatable airbags rather
    // than ore or foliage. White highlight + dark shadow give a soft 3D
    // round read at any size.
    var cxw = player.x + PLAYER_W / 2;
    var cyw = player.y + PLAYER_H / 2;
    for (var i = 0; i < R.balloons.length; i++) {
      var b = R.balloons[i];

      // Pop animation — small expanding ring + scatter of debris pieces.
      if (b.popped) {
        if (b.popT < 0.5) {
          var p = b.popT / 0.5;       // 0 → 1
          var bx = cxw + b.ox;
          var by = cyw + b.oy;
          // Expanding ring
          var ringR = b.targetR * (0.5 + p * 1.3);
          ctx.strokeStyle = 'rgba(255,160,160,' + (1 - p).toFixed(2) + ')';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(bx, by, ringR, 0, Math.PI * 2);
          ctx.stroke();
          // Debris flakes — 6 pieces fanning out
          ctx.fillStyle = 'rgba(255,140,140,' + (1 - p).toFixed(2) + ')';
          for (var dn = 0; dn < 6; dn++) {
            var ang = (dn / 6) * Math.PI * 2;
            var dist = b.targetR * 0.4 + p * b.targetR * 1.6;
            ctx.fillRect(bx + Math.cos(ang) * dist, by + Math.sin(ang) * dist, 2, 2);
          }
        }
        continue;
      }
      // Jiggle offset — small bobbing from the inflate energy
      var jx = Math.sin(b.phase) * 0.6;
      var jy = Math.cos(b.phase * 1.3) * 0.5;
      var bx = cxw + b.ox + jx;
      var by = cyw + b.oy + jy;
      // Soft drop shadow on the rig body below the balloon
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(bx, by + b.r * 0.6, b.r * 0.95, b.r * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Main balloon body — radial gradient for a 3D pneumatic look
      var bg = ctx.createRadialGradient(
        bx - b.r * 0.35, by - b.r * 0.35, b.r * 0.1,
        bx, by, b.r
      );
      bg.addColorStop(0,   '#fff5f0');
      bg.addColorStop(0.4, '#ffc8b8');
      bg.addColorStop(0.85,'#e8806c');
      bg.addColorStop(1,   '#a04040');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, b.r, 0, Math.PI * 2);
      ctx.fill();
      // Specular highlight — small bright dot
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(bx - b.r * 0.4, by - b.r * 0.45, b.r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      // Subtle equator seam line (gives a "stitched airbag" feel)
      ctx.strokeStyle = 'rgba(140,40,40,0.35)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.ellipse(bx, by, b.r, b.r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ----- Tether lines from rig corners to balloons (only while inflated) -----
    // Drawn BEFORE the rig so they tuck behind the balloons but in front of
    // the body — but since we're called after drawPlayer we just live with
    // them being on top, which actually reads fine for ropes.
    ctx.strokeStyle = 'rgba(40,20,20,0.55)';
    ctx.lineWidth = 0.6;
    for (var ti = 0; ti < R.balloons.length; ti++) {
      var bb = R.balloons[ti];
      if (bb.popped) continue;
      var ax = cxw + bb.ox * 0.4;     // anchor partway into the rig
      var ay = cyw + bb.oy * 0.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(cxw + bb.ox, cyw + bb.oy);
      ctx.stroke();
    }

    // ----- Impact sparks (debris from each bounce) -----
    for (var sp = 0; sp < R.sparks.length; sp++) {
      var s = R.sparks[sp];
      var lifeProg = 1 - (s.t / s.maxT);
      var alpha = Math.max(0, 1 - lifeProg);
      if (s.dust) {
        ctx.fillStyle = 'rgba(180,150,110,' + (alpha * 0.6).toFixed(2) + ')';
        var sz = 1.5 + lifeProg * 1.5;
        ctx.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
      } else {
        ctx.fillStyle = 'rgba(255,210,140,' + alpha.toFixed(2) + ')';
        ctx.fillRect(s.x, s.y, 1.5, 1.5);
      }
    }
  }

  // ===== v11.4 — Pixel stencil font (UI_STYLE.md §7) =====
  // 5×7 bitmap, all-caps, integer-pixel-aligned, no AA. Each glyph is
  // 7 strings of 5 chars where 'X' = on-pixel and '.' = off-pixel.
  // Used by every instrument in the console and by all in-world
  // signage. ctx.fillText is BANNED in v11+ paths.
  var STENCIL_FONT = {
    'A': ['.XXX.','X...X','X...X','XXXXX','X...X','X...X','X...X'],
    'B': ['XXXX.','X...X','X...X','XXXX.','X...X','X...X','XXXX.'],
    'C': ['.XXXX','X....','X....','X....','X....','X....','.XXXX'],
    'D': ['XXXX.','X...X','X...X','X...X','X...X','X...X','XXXX.'],
    'E': ['XXXXX','X....','X....','XXXX.','X....','X....','XXXXX'],
    'F': ['XXXXX','X....','X....','XXXX.','X....','X....','X....'],
    'G': ['.XXXX','X....','X....','X.XXX','X...X','X...X','.XXXX'],
    'H': ['X...X','X...X','X...X','XXXXX','X...X','X...X','X...X'],
    'I': ['XXXXX','..X..','..X..','..X..','..X..','..X..','XXXXX'],
    'J': ['....X','....X','....X','....X','....X','X...X','.XXX.'],
    'K': ['X...X','X..X.','X.X..','XX...','X.X..','X..X.','X...X'],
    'L': ['X....','X....','X....','X....','X....','X....','XXXXX'],
    'M': ['X...X','XX.XX','X.X.X','X.X.X','X...X','X...X','X...X'],
    'N': ['X...X','X...X','XX..X','X.X.X','X..XX','X...X','X...X'],
    'O': ['.XXX.','X...X','X...X','X...X','X...X','X...X','.XXX.'],
    'P': ['XXXX.','X...X','X...X','XXXX.','X....','X....','X....'],
    'Q': ['.XXX.','X...X','X...X','X...X','X.X.X','X..X.','.XX.X'],
    'R': ['XXXX.','X...X','X...X','XXXX.','X.X..','X..X.','X...X'],
    'S': ['.XXXX','X....','X....','.XXX.','....X','....X','XXXX.'],
    'T': ['XXXXX','..X..','..X..','..X..','..X..','..X..','..X..'],
    'U': ['X...X','X...X','X...X','X...X','X...X','X...X','.XXX.'],
    'V': ['X...X','X...X','X...X','X...X','X...X','.X.X.','..X..'],
    'W': ['X...X','X...X','X...X','X.X.X','X.X.X','XX.XX','X...X'],
    'X': ['X...X','X...X','.X.X.','..X..','.X.X.','X...X','X...X'],
    'Y': ['X...X','X...X','.X.X.','..X..','..X..','..X..','..X..'],
    'Z': ['XXXXX','....X','...X.','..X..','.X...','X....','XXXXX'],
    '0': ['.XXX.','X...X','X..XX','X.X.X','XX..X','X...X','.XXX.'],
    '1': ['..X..','.XX..','..X..','..X..','..X..','..X..','.XXX.'],
    '2': ['.XXX.','X...X','....X','...X.','..X..','.X...','XXXXX'],
    '3': ['XXXX.','....X','....X','.XXX.','....X','....X','XXXX.'],
    '4': ['X...X','X...X','X...X','XXXXX','....X','....X','....X'],
    '5': ['XXXXX','X....','X....','XXXX.','....X','....X','XXXX.'],
    '6': ['.XXXX','X....','X....','XXXX.','X...X','X...X','.XXX.'],
    '7': ['XXXXX','....X','...X.','...X.','..X..','..X..','..X..'],
    '8': ['.XXX.','X...X','X...X','.XXX.','X...X','X...X','.XXX.'],
    '9': ['.XXX.','X...X','X...X','.XXXX','....X','....X','XXXX.'],
    ' ': ['.....','.....','.....','.....','.....','.....','.....'],
    '.': ['.....','.....','.....','.....','.....','.....','..X..'],
    ',': ['.....','.....','.....','.....','.....','..X..','.X...'],
    '-': ['.....','.....','.....','XXXXX','.....','.....','.....'],
    ':': ['.....','.....','..X..','.....','.....','..X..','.....'],
    '/': ['....X','...X.','...X.','..X..','..X..','.X...','.X...'],
    '!': ['..X..','..X..','..X..','..X..','..X..','.....','..X..'],
    '?': ['.XXX.','X...X','....X','...X.','..X..','.....','..X..'],
    '+': ['.....','..X..','..X..','XXXXX','..X..','..X..','.....'],
    '$': ['..X..','.XXXX','X.X..','.XXX.','..X.X','XXXX.','..X..'],
    '°': ['.XXX.','.X.X.','.XXX.','.....','.....','.....','.....'],
    // v24.142 — glyphs for the salvage-manifest death plate (290)
    '%': ['XX..X','XX..X','...X.','..X..','.X...','X..XX','X..XX'],
    '·': ['.....','.....','.....','.XX..','.XX..','.....','.....'],
    '▸': ['X....','XX...','XXX..','XXXX.','XXX..','XX...','X....'],
    '"': ['.X.X.','.X.X.','.....','.....','.....','.....','.....']
  };
  function drawStencilGlyph(ch, x, y, scale, color) {
    var rows = STENCIL_FONT[ch] || STENCIL_FONT[' '];
    ctx.fillStyle = color;
    for (var row = 0; row < 7; row++) {
      var line = rows[row];
      for (var col = 0; col < 5; col++) {
        if (line.charCodeAt(col) === 88) {  // 'X'
          ctx.fillRect(x + col * scale, y + row * scale, scale, scale);
        }
      }
    }
  }
  // Draws a string starting at (x, y), top-left aligned. Returns the
  // total drawn width so callers can right-align if needed.
  function drawStencilText(str, x, y, scale, color) {
    var s = (str + '').toUpperCase();
    var glyphW = 5 * scale;
    var spacing = 1 * scale;
    var advance = glyphW + spacing;
    for (var i = 0; i < s.length; i++) {
      drawStencilGlyph(s.charAt(i), x + i * advance, y, scale, color);
    }
    return s.length * advance - spacing;
  }
  function stencilTextWidth(str, scale) {
    var n = (str + '').length;
    if (n === 0) return 0;
    return n * (5 * scale + scale) - scale;
  }

  // ===== v11.5 — Console primitives + helpers =====

  // v26.43 — the shared instrument aperture: a dark glass window recessed
  // into the gunmetal plate through a machined 2-px step. Every boxed
  // readout (speed / hull / cargo / depth / cash) opens with one of these,
  // so the cluster reads as one milled panel with lit windows instead of
  // eight framed boxes. Returns the inner glass rect.
  function instrWindow(x, y, w, h) {
    ctx.fillStyle = UI_OUTLINE;                 // milled cut line
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = UIMAT_PLATE_SHADOW;         // step ring: shadowed top lip,
    ctx.fillRect(x + 1, y + 1, w - 2, 1);       // lit bottom lip = recessed
    ctx.fillRect(x + 1, y + 1, 1, h - 2);
    ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT;
    ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
    ctx.fillRect(x + w - 2, y + 2, 1, h - 3);
    ctx.fillStyle = UIT_INSET_DK;               // the glass
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    ctx.fillStyle = 'rgba(220,235,255,0.09)';   // §4.4: top-edge reflection only
    ctx.fillRect(x + 2, y + 2, w - 4, 1);
    return { x: x + 2, y: y + 2, w: w - 4, h: h - 4 };
  }

  // Warning lamp per §4.3. state ∈ 'critical' | 'caution' | 'info' | 'off'.
  // Blink: critical 2 Hz hard toggle, caution 1 Hz, info pulses once
  // (caller-managed), off = unlit.
  function drawWarningLamp(cx, cy, state) {
    var blinkOn;
    if (state === 'critical') {
      blinkOn = (Math.floor(performance.now() / 250) & 1) === 0;
    } else if (state === 'caution') {
      blinkOn = (Math.floor(performance.now() / 500) & 1) === 0;
    } else if (state === 'info') {
      blinkOn = true;
    } else {
      blinkOn = false;
    }
    // Socket ring
    ctx.fillStyle = UI_OUTLINE;
    ctx.fillRect(cx - 3, cy - 3, 7, 7);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(cx - 2, cy - 2, 5, 5);
    if (state === 'off' || !blinkOn) {
      // Unlit core
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      ctx.fillStyle = '#0f0f0f';
      ctx.fillRect(cx, cy, 1, 1);
      return;
    }
    var core, halo;
    if (state === 'critical')     { core = '#ff4030'; halo = '#a01010'; }
    else if (state === 'caution') { core = '#ffb030'; halo = '#b06010'; }
    else                          { core = '#4080ff'; halo = '#2040a0'; } // info
    // Halo
    ctx.fillStyle = halo;
    ctx.fillRect(cx - 2, cy - 2, 5, 5);
    // Bright core
    ctx.fillStyle = core;
    ctx.fillRect(cx - 1, cy - 1, 3, 3);
    // Brightest centre pixel
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx, cy, 1, 1);
  }

  // Console readouts share a baseline and a quiet, unboxed surface. Color
  // carries a warning or a payout; a healthy rig does not light six alarms.
  function consoleText(text, x, y, size, color, align, bold) {
    ctx.font = (bold ? '600 ' : '400 ') + size + 'px ' + UI_FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color || UIT_TEXT;
    ctx.fillText(text, Math.round(x), Math.round(y));
  }
  function drawBayLabel(bx, by, bw, text) {
    consoleText(text, bx, by + 11, 11, UIT_DIM);
  }
  function consoleValue(text, suffix, bx, by, bw, bh, color, preferred) {
    var size = preferred || (bh >= 68 ? 26 : 22);
    var unitW = suffix ? suffix.length * 7 + 5 : 0;
    ctx.font = '600 ' + size + 'px ' + UI_FONT;
    while (size > 16 && ctx.measureText(text).width + unitW > bw) {
      size--; ctx.font = '600 ' + size + 'px ' + UI_FONT;
    }
    var y = by + (bh >= 68 ? 39 : 33);
    consoleText(text, bx, y, size, color, 'left', true);
    var tw = ctx.measureText(text).width;
    if (suffix) consoleText(suffix, bx + tw + 5, y, 11, UIT_DIM);
  }
  function consoleMoney(amount, width, size) {
    var n = Math.max(0, Math.floor(amount || 0));
    var full = '$' + n.toLocaleString();
    ctx.font = '600 ' + size + 'px ' + UI_FONT;
    if (ctx.measureText(full).width <= width) return full;
    // Preserve the reading size on small screens. The shop has the exact balance.
    var divisor = n >= 1e9 ? 1e9 : n >= 1e6 ? 1e6 : 1e3;
    var unit = divisor === 1e9 ? 'b' : divisor === 1e6 ? 'm' : 'k';
    return '$' + (Math.floor(n / divisor * 10) / 10).toFixed(1) + unit;
  }
  // Gauges keep their large numerical readings, with material cues particular
  // to each instrument rather than six identical bars.
  function consoleMeter(bx, by, bw, bh, fraction, color) {
    var y = Math.round(by + bh - 22), fill = Math.max(0, Math.min(1, fraction));
    ctx.fillStyle = UIT_EDGE; ctx.fillRect(bx, y - 1, bw, 7);
    ctx.fillStyle = UIMAT_PLATE_SHADOW; ctx.fillRect(bx + 1, y, bw - 2, 4);
    ctx.fillStyle = color; ctx.fillRect(bx + 1, y, Math.round((bw - 2) * fill), 4);
    ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT; ctx.fillRect(bx, y + 5, bw, 1);
    return y;
  }
  function consoleCargoHovered() {
    if (isMobile || !mouseCursor) return false;
    var scale = consoleScale();
    for (var i = 0; i < consoleBayLayout.length; i++) {
      var cell = consoleBayLayout[i];
      if (cell.bay.id === 'cargo') return mouseCursor.x >= cell.bx * scale &&
        mouseCursor.x <= (cell.bx + cell.bw) * scale && mouseCursor.y >= cell.by * scale &&
        mouseCursor.y <= (cell.by + cell.bh) * scale;
    }
    return false;
  }
  function consoleFuelDial(cx, cy, radius, fraction, color) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = UIMAT_WELD;
    ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI, Math.PI * 2); ctx.stroke();
    for (var i = 0; i <= 4; i++) {
      var a = Math.PI + i * Math.PI / 4;
      ctx.strokeStyle = i === 0 ? UIT_RED : UIMAT_WELD;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (radius - 2), cy + Math.sin(a) * (radius - 2));
      ctx.lineTo(cx + Math.cos(a) * (radius - 5), cy + Math.sin(a) * (radius - 5));
      ctx.stroke();
    }
    var angle = Math.PI + Math.PI * fraction;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * (radius - 5), cy + Math.sin(angle) * (radius - 5)); ctx.stroke();
    ctx.fillStyle = UIT_GOLD; ctx.fillRect(cx - 2, cy - 2, 4, 4);
    ctx.fillStyle = UIT_TEXT; ctx.fillRect(cx - 1, cy - 1, 1, 1);
    ctx.restore();
  }
  function consoleFuelReading() {
    var capacity = Math.max(1, maxFuel);
    var fraction = Math.max(0, Math.min(1, player.fuel / capacity));
    var home = getFuelToSurface();
    var shortfall = home > 0.5 && player.fuel < home;
    return { fraction: fraction, percent: Math.floor(fraction * 100),
      home: home, homePercent: Math.ceil(home / capacity * 100), shortfall: shortfall,
      color: shortfall || fraction < 0.15 ? UIT_RED : fraction < 0.30 ? UIT_GOLD : UIT_TEXT };
  }
  function drawFuelGauge(bx, by, bw, bh) {
    var fuel = consoleFuelReading();
    drawBayLabel(bx, by, bw, 'FUEL');
    if (reserveFuel > 0) consoleText(reserveFuel + ' spare', bx + bw, by + 11, 11, UIT_DIM, 'right');
    consoleValue('' + fuel.percent, '%', bx, by, bw, bh, fuel.color);
    if (bw >= 116) consoleFuelDial(bx + bw - 21, by + 39, 19, fuel.fraction, fuel.color);
    var y = consoleMeter(bx, by, bw, bh, fuel.fraction, fuel.color);
    // Etched quarter marks and a brass slider make the linear backup useful
    // even on phones where the small round dial would crowd the number.
    for (var i = 0; i <= 4; i++) {
      ctx.fillStyle = UIMAT_WELD;
      ctx.fillRect(bx + Math.round((bw - 1) * i / 4), y + 7, 1, 2);
    }
    var needle = bx + Math.round((bw - 3) * fuel.fraction);
    ctx.fillStyle = fuel.fraction < 0.30 ? fuel.color : UIT_GOLD;
    ctx.fillRect(needle, y - 2, 2, 8);
    if (fuel.home > 0.5) {
      // A labelled notch replaces the unexplained dot on the old dial.
      var x = Math.round(bx + Math.min(1, fuel.home / maxFuel) * (bw - 2));
      ctx.fillStyle = UIT_INSET; ctx.fillRect(x - 1, y - 2, 4, 8);
      ctx.fillStyle = fuel.shortfall ? UIT_RED : UIT_TEXT; ctx.fillRect(x, y - 2, 2, 8);
      consoleText('Home ~' + fuel.homePercent + '%', bx, by + bh - 3, 11, fuel.shortfall ? UIT_RED : UIT_DIM);
    } else if (fuel.fraction < 0.30) {
      consoleText('Refuel', bx, by + bh - 3, 11, fuel.color);
    }
  }

  var speedoMphSmooth = 0;
  // Easing runs every frame, including cache hits.
  function consoleTickSpeedo() {
    var spd = player ? Math.sqrt(player.vx * player.vx + player.vy * player.vy) : 0;
    speedoMphSmooth += (spd / 32 * 2.237 - speedoMphSmooth) * 0.18;
    if (speedoMphSmooth < 0.05) speedoMphSmooth = 0;
  }
  function drawSpeedDisplay(bx, by, bw, bh) {
    var fraction = speedoMphSmooth / SPEEDO_MPH_MAX;
    var color = fraction >= 0.82 ? UIT_RED : fraction >= 0.60 ? UIT_GOLD : UIT_BODY;
    drawBayLabel(bx, by, bw, 'SPEED');
    consoleValue('' + Math.round(speedoMphSmooth), 'mph', bx, by, bw, bh, color, 22);
  }
  function drawHullPlates(bx, by, bw, bh) {
    var max = Math.max(1, getMaxHull());
    var fraction = Math.max(0, Math.min(1, player.hull / max));
    var color = fraction <= 0.25 ? UIT_RED : fraction <= 0.50 ? UIT_GOLD : UIT_BODY;
    drawBayLabel(bx, by, bw, 'HULL');
    consoleValue('' + Math.ceil(fraction * 100), '%', bx, by, bw, bh, color);
    var y = Math.round(by + bh - 23);
    var plates = Math.min(24, 6 + (Math.max(1, upgrades.hullLevel || 1) - 1) * 3);
    // A tier adds physical armor segments; damage empties them from the right.
    for (var i = 0; i < plates; i++) {
      var x0 = Math.round(bx + bw * i / plates), x1 = Math.round(bx + bw * (i + 1) / plates);
      var remaining = Math.max(0, Math.min(1, fraction * plates - i));
      ctx.fillStyle = UIT_EDGE; ctx.fillRect(x0, y, x1 - x0 - 1, 8);
      if (remaining > 0) {
        ctx.fillStyle = color; ctx.fillRect(x0, y + 1, Math.max(1, Math.round((x1 - x0 - 1) * remaining)), 5);
        ctx.fillStyle = UIT_TEXT; ctx.fillRect(x0, y + 1, Math.max(1, Math.round((x1 - x0 - 1) * remaining)), 1);
        ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT; ctx.fillRect(x0, y + 6, x1 - x0 - 1, 1);
      }
    }
    consoleText(fraction <= 0.50 ? 'Repair' : max + ' HP', bx, by + bh - 3, 11, fraction <= 0.50 ? color : UIT_DIM);
  }
  function drawCargoBay(bx, by, bw, bh) {
    var used = cargoUsed(), capacity = Math.max(1, maxCargo), value = 0;
    var full = used >= capacity;
    for (var i = 0; i < cargo.length; i++) value += cargoUnitValue(cargo[i]);
    var hover = consoleCargoHovered();
    var open = typeof cargoManifestOpen !== 'undefined' && cargoManifestOpen;
    // A raised hatch makes this instrument visibly operable. It is the one
    // console reading that opens a view, so it earns the brass label and edge.
    ctx.fillStyle = hover || open ? UIT_PANEL_SEL : UIT_PANEL;
    ctx.fillRect(bx - 3, by - 2, bw + 6, bh + 3);
    ctx.fillStyle = hover || open ? UIT_GOLD : UIMAT_WELD;
    ctx.fillRect(bx - 3, by - 2, bw + 6, 1);
    ctx.fillStyle = UIMAT_PLATE_SHADOW;
    ctx.fillRect(bx - 3, by + bh, bw + 6, 1);
    consoleText('CARGO', bx, by + 11, 11, UIT_GOLD);
    consoleText('>', bx + bw - 1, by + 11, 12, UIT_GOLD, 'right');
    consoleValue('' + used, '/ ' + capacity, bx, by, bw, bh, full ? UIT_GOLD : UIT_TEXT);
    if (bw >= 130 && cargo.length) {
      // Actual ore art, not arbitrary colored chips. A narrow hatch keeps its
      // capacity number; every specimen is available in the full manifest.
      var samples = [], seen = {};
      for (var c = cargo.length - 1; c >= 0 && samples.length < 2; c--) {
        var type = cargoType(cargo[c]);
        if (!seen[type]) { samples.push(cargo[c]); seen[type] = true; }
      }
      for (var j = 0; j < samples.length; j++) {
        ctx.save();
        ctx.translate(bx + bw - 23 * (j + 1), by + 19);
        ctx.scale(0.625, 0.625);
        drawLedgerSpecimen(0, 0, cargoType(samples[j]), j);
        if (cargoShiny(samples[j])) { ctx.fillStyle = UIT_GOLD_HI; ctx.fillRect(25, 1, 5, 2); }
        ctx.restore();
      }
    }
    consoleMeter(bx, by, bw, bh, used / capacity, full ? UIT_GOLD : UIT_BODY);
    if (value > 0) consoleText(consoleMoney(value, bw - (full ? 33 : 0), 11), bx, by + bh - 3, 11, UIT_MONEY);
    else consoleText('View hold', bx, by + bh - 3, 11, UIT_DIM);
    if (full) consoleText('FULL', bx + bw, by + bh - 3, 11, UIT_GOLD, 'right');
  }
  function drawDepthDisplay(bx, by, bw, bh) {
    var depth = Math.max(0, ((player.y - SKY_ROWS * TILE) / TILE) | 0);
    drawBayLabel(bx, by, bw, 'DEPTH');
    var digits = ('000' + depth).slice(-4);
    var digitW = Math.min(18, Math.floor((bw - 15) / 4));
    var size = Math.max(16, Math.min(23, Math.floor((digitW - 1) / 0.6)));
    var base = by + Math.max(size + 15, bh >= 68 ? 39 : 33), top = base - size;
    if (digitW < 11 || depth > 9999) {
      consoleValue('' + depth, 'm', bx, by, bw, bh, UIT_TEXT, 22);
      return;
    }
    // Four rolling-counter windows, with leading zeroes kept quiet. Shading
    // suggests the drum surface without adding movement to the cached reading.
    var significant = false;
    for (var i = 0; i < 4; i++) {
      var dx = bx + i * digitW;
      ctx.fillStyle = UIT_EDGE; ctx.fillRect(dx, top - 2, digitW - 1, size + 6);
      ctx.fillStyle = UIMAT_PLATE_SHADOW; ctx.fillRect(dx + 1, top - 1, digitW - 3, 2);
      ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT; ctx.fillRect(dx, base + 3, digitW - 1, 1);
      if (digits[i] !== '0' || i === 3) significant = true;
      consoleText(digits[i], dx + 1, base, size, significant ? UIT_TEXT : UIMAT_WELD, 'left', true);
    }
    consoleText('m', bx + digitW * 4 + 4, base, 11, UIT_DIM);
  }
  function consoleSaveState() {
    if (SAVE_DISABLED) return 'off';
    if (saveLastOk === false) return 'failed';
    return saveLampT > 0 && saveLastWallMs > 0 ? 'saved' : 'idle';
  }
  function drawCashDisplay(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'CASH');
    var shown = typeof displayMoney === 'number' && isFinite(displayMoney) ? displayMoney : money;
    var size = bh >= 68 ? 24 : 20;
    var amount = consoleMoney(shown, bw, size);
    consoleValue(amount, '', bx, by, bw, bh, UIT_MONEY, size);
    // Describe save state instead of relying on an unexplained blue lamp.
    if (consoleSaveState() === 'failed') consoleText('Save failed', bx, by + bh - 3, 11, UIT_RED);
    else if (consoleSaveState() === 'saved') consoleText('Saved', bx, by + bh - 3, 11, UIT_DIM);
  }

  function drawReservePip(x, y, w, h, filled) {
    var capW = 3, capH = 2;
    var capX = x + ((w - capW) >> 1);
    if (!filled) {
      ctx.fillStyle = '#080a0e';
      ctx.fillRect(x, y + capH, w, h - capH);
      ctx.fillRect(capX, y, capW, capH);
      ctx.fillStyle = '#232933';
      ctx.fillRect(x, y + capH, w, 1);
      ctx.fillStyle = '#12161c';
      ctx.fillRect(x + 1, y + capH + 1, w - 2, h - capH - 2);
      return;
    }
    ctx.fillStyle = '#6f4d16';
    ctx.fillRect(capX, y, capW, capH);
    ctx.fillStyle = '#e0a838';
    ctx.fillRect(x, y + capH, w, h - capH);
    ctx.fillStyle = '#ffd35c';
    ctx.fillRect(x, y + capH, w, 1);
    ctx.fillRect(x, y + capH, 1, h - capH);
    ctx.fillStyle = '#9c6d1c';
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x + w - 1, y + capH, 1, h - capH);
    ctx.fillStyle = 'rgba(60,40,8,0.55)';
    ctx.fillRect(x + 1, y + capH + ((h - capH) >> 1), w - 2, 1);
  }

  // ----- Auto-sell reveal renderer (the floaters style from autosell-lab.html) -----
  // Logic + state (sellReveal, srFloats, srParts, srNow, SR_L, helpers) live in
  // 060; this is the draw side only. Cards are canvas Commit Mono on a riveted
  // steel placard; chips are 2-3 px squares. Gold (#ffd24a) is reserved for the
  // payout figure + coins (UI_STYLE.md §6 money code); ore tier reads from the
  // bigger value type + the swatch, never a coloured frame.
  function srCardScale(cd) {
    var pin = srClamp((srNow - cd.born) / SR_L.popIn, 0, 1);
    var sc = srEaseBack(pin, SR_L.overshoot);
    var slam = 1 + (cd.slam - 1) * Math.exp(-(srNow - cd.slamAt) / 200); // brief finale slam
    var shinyBump = (cd.it && cd.it.shiny) ? 1.12 : 1;                   // shiny placard sits a touch bigger
    return sc * slam * shinyBump;
  }
  function srFloatRiseAt(age) { return SR_L.floatRise * (1 - Math.exp(-age / 480)); }
  function srFloatAlpha(cd) {
    // When the grand-total board is queued, clear EVERY card (hero included) off the
    // stage so the split-flap board lands on a clean field, gone exactly as it
    // commits at sellReveal.finaleAt (mirrors the lab floatAlpha flap handoff).
    if (sellReveal && sellReveal.finaleAt >= 0) {
      var clearWin = Math.min(SR_L.finaleDelay * 0.55, 300);
      var clr = srClamp((sellReveal.finaleAt - srNow) / clearWin, 0, 1);
      var nat;
      if (cd.last) { nat = 1; }
      else {
        var a0 = srNow - cd.born, fs0 = cd.life - SR_L.floatFade;
        nat = (a0 <= fs0) ? 1 : srClamp(1 - (a0 - fs0) / SR_L.floatFade, 0, 1);
      }
      return Math.min(nat, clr);
    }
    var age = srNow - cd.born;
    var fadeStart = cd.life - SR_L.floatFade;
    if (age <= fadeStart) return 1;
    return srClamp(1 - (age - fadeStart) / SR_L.floatFade, 0, 1);
  }

  function srDrawCardPlate(it, ox, oy, scale) {
    var big = scale;
    var fontMain = Math.round(12 * big), fontVal = Math.round((it.tier >= 2 ? 17 : 14) * big);
    var pad = 9 * big;
    ctx.font = '700 ' + fontVal + 'px ' + UI_FONT;
    var valStr = '+$' + it.total.toLocaleString();
    var qty = it.oil ? (it.count.toFixed(1) + ' gal') : ('x' + it.count);
    var nameStr = it.oil ? (it.label + ' ' + qty) : (it.count + ' x ' + it.label);
    var wVal = ctx.measureText(valStr).width;
    ctx.font = (it.tier >= 1 ? '700 ' : '400 ') + fontMain + 'px ' + UI_FONT;
    var wName = ctx.measureText(nameStr).width;
    var sw = 14 * big; // ore swatch
    var cw = pad + sw + 8 * big + Math.max(wName, wVal) + pad;
    var ch = pad * 2 + fontMain + 4 * big + fontVal;
    var x = Math.round(ox - cw * 0.5), y = Math.round(oy - ch * 0.5);
    cw = Math.round(cw); ch = Math.round(ch);
    var cr = Math.max(3, Math.round(4 * big)); // corner radius scales with the card

    // steel placard: opaque plate, softly rounded, dark outline, integer-snapped
    ctx.fillStyle = '#1c232e'; roundedRectPath(x, y, cw, ch, cr); ctx.fill();
    // bevel: highlight top/left, shadow bottom/right (inset to meet the rounding)
    ctx.fillStyle = '#2b3340'; ctx.fillRect(x + cr, y, cw - cr * 2, 1); ctx.fillRect(x, y + cr, 1, ch - cr * 2);
    ctx.fillStyle = '#0e1219'; ctx.fillRect(x + cr, y + ch - 1, cw - cr * 2, 1); ctx.fillRect(x + cw - 1, y + cr, 1, ch - cr * 2);
    // dark rounded outline
    ctx.strokeStyle = '#070a0e'; ctx.lineWidth = 1; roundedRectPath(x + 0.5, y + 0.5, cw - 1, ch - 1, cr); ctx.stroke();
    // corner rivets (pulled in to clear the rounding)
    ctx.fillStyle = '#39424f';
    ctx.fillRect(x + cr + 1, y + cr + 1, 1, 1); ctx.fillRect(x + cw - cr - 2, y + cr + 1, 1, 1);
    ctx.fillRect(x + cr + 1, y + ch - cr - 2, 1, 1); ctx.fillRect(x + cw - cr - 2, y + ch - cr - 2, 1, 1);

    // swatch: ore-colour chip with hard highlight/shadow edges
    sw = Math.round(sw);
    var swx = Math.round(x + pad), swy = Math.round(y + ch * 0.5 - sw * 0.5);
    ctx.fillStyle = it.color; ctx.fillRect(swx, swy, sw, sw);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(swx, swy, sw, 1); ctx.fillRect(swx, swy, 1, sw);
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(swx, swy + sw - 1, sw, 1); ctx.fillRect(swx + sw - 1, swy, 1, sw);

    var tx = Math.round(swx + sw + 8 * big);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    // name
    ctx.font = (it.tier >= 1 ? '700 ' : '400 ') + fontMain + 'px ' + UI_FONT;
    ctx.fillStyle = it.shiny ? '#ffe9a6' : '#cdd6e0'; ctx.fillText(nameStr, tx, Math.round(y + pad));
    // value (money gold, no glow)
    ctx.font = '700 ' + fontVal + 'px ' + UI_FONT;
    ctx.fillStyle = '#ffd24a'; ctx.fillText(valStr, tx, Math.round(y + pad + fontMain + 4 * big));
    if (it.shiny) {
      // SHINY placard: warm-gold frame + a soft outer halo + twinkling spark
      // points around the plate (echoes the in-world shiny tile). Unmistakable
      // at a glance, even mid-cycle. Sparks fade WITH the card (cardA = alpha).
      var cardA = ctx.globalAlpha;
      ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = Math.max(1, Math.round(1.4 * big));
      roundedRectPath(x + 0.5, y + 0.5, cw - 1, ch - 1, cr); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,221,110,0.30)'; ctx.lineWidth = Math.max(1, Math.round(2.4 * big));
      roundedRectPath(x - 1.5, y - 1.5, cw + 3, ch + 3, cr + 1); ctx.stroke();
      var spk = [[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch],
                 [x + cw * 0.5, y - 4 * big], [x + cw * 0.5, y + ch + 4 * big]];
      var bw2 = Math.max(1, Math.round(big));
      ctx.fillStyle = '#fff6cf';
      for (var si = 0; si < spk.length; si++) {
        var ph = Math.sin(srNow * 0.007 + si * 1.9) * 0.5 + 0.5;   // 0..1 twinkle
        var rad = Math.round((1.8 + 2.6 * ph) * big);
        var sx = Math.round(spk[si][0]), sy = Math.round(spk[si][1]);
        ctx.globalAlpha = cardA * (0.45 + 0.55 * ph);
        ctx.fillRect(sx - (bw2 >> 1), sy - rad, bw2, rad * 2);    // vertical spark bar
        ctx.fillRect(sx - rad, sy - (bw2 >> 1), rad * 2, bw2);    // horizontal spark bar
      }
      ctx.globalAlpha = cardA;
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function srDrawChips() {
    var us = srUiScale();                 // live zoom scale (size + local-offset projection)
    for (var i = 0; i < srParts.length; i++) {
      var p = srParts[i];
      var a = 1; // full while airborne + a brief hold on landing, then ease out
      if (p.landed) {
        var hold = p.restLife * 0.35;
        a = p.landT <= hold ? 1 : srClamp(1 - (p.landT - hold) / (p.restLife - hold), 0, 1);
        a = a * a; // ease the tail
      }
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      var z = Math.max(1, (p.sz * us) | 0);
      var base = srWorldToScreen(p.wax, p.way);     // live world projection of the spawn spot
      var px = (base.x + p.lx * us) | 0;            // local offset scaled to current zoom
      var py = (base.y + p.ly * us) | 0;
      if (p.landed) {
        // lying flat on the deck: a short sliver + a 1px contact shadow beneath
        var fh = Math.max(1, (z * 0.5) | 0);
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px - 1, py + fh, z + 2, 1);
        ctx.fillStyle = p.col; ctx.fillRect(px, py, z + 1, fh);
        if (p.gold) { ctx.fillStyle = 'rgba(255,240,200,0.5)'; ctx.fillRect(px, py, z + 1, 1); }
      } else {
        // airborne chip: solid square, coins catch a shimmer pixel
        ctx.fillStyle = p.col; ctx.fillRect(px, py, z, z);
        if (p.gold) { ctx.fillStyle = 'rgba(255,245,210,0.7)'; ctx.fillRect(px, py, 1, 1); }
      }
    }
    ctx.globalAlpha = 1;
  }

  function srDrawTelegraph() {
    if (!sellReveal) return;
    var sr = sellReveal;
    var rel = srNow - sr.startNow;
    for (var i = 0; i < sr.beats.length; i++) {
      var b = sr.beats[i];
      if (b.fired || !b.tele) continue;
      var lead = b.at - rel;
      if (lead > 0 && lead < b.tele) {
        var pr = 1 - lead / b.tele; // 0..1 building
        var us = srUiScale();            // live: leads a not-yet-spawned beat, so no baked us0
        var a = srRigAnchor();
        var gx = a.cx, gyy = a.gy - 94 * us;  // telegraph leads the next beat at the rig's live spot
        var rad = (30 + pr * 60) * us;
        var gg = ctx.createRadialGradient(gx, gyy, 2, gx, gyy, rad);
        var al = 0.30 * pr;
        gg.addColorStop(0, 'rgba(255,226,122,' + al.toFixed(3) + ')');
        gg.addColorStop(1, 'rgba(255,226,122,0)');
        ctx.fillStyle = gg; ctx.fillRect(gx - rad, gyy - rad, rad * 2, rad * 2);
      }
    }
  }

  // ---- Grand-total finale board ----------------------------------------------
  // A brass split-flap departure board (built from the depth-drum vocabulary:
  // steel bezel -> bronze ring -> brushed-brass face -> recessed slots) that locks
  // the haul total in right->left, holds to be read, then fades. It commits one
  // closure beat after the richest stack pops (sellReveal.finaleAt, scheduled in
  // srFireBeat). Ported verbatim from the approved autosell-lab "flap" finale.
  var SR_FLAP_PER = 64, SR_FLAP_SPIN = 130; // ms stagger between digit locks, ms cycling

  function srDrawFinale() {
    if (!sellReveal || sellReveal.finaleAt < 0 || srNow < sellReveal.finaleAt) return;
    var age = srNow - sellReveal.finaleAt;
    var life = SR_L.finaleIn + SR_L.finaleBoardHold;
    var fade = age <= life ? 1 : srClamp(1 - (age - life) / SR_L.finaleBoardFade, 0, 1);
    if (fade <= 0.002) return;
    // The grand-total board is WORLD-pinned, just like the cards + chips: it locks to
    // the spot where the hero card popped (sellReveal.fwx/fwy = the rig's feet in WORLD
    // coords, stamped in srFireBeat) and re-projects via srWorldToScreen every frame.
    // So it STAYS WHERE IT IS on the dock and the player can fly away from it (it
    // scrolls off-screen), instead of following the rig or sticking to the HUD. The
    // lift is a fixed WORLD distance (132 px above the rig's feet, projected through
    // srWorldToScreen like the anchor) so the board clears the gas-station canopy +
    // sign (~86 world px tall, drawn at groundY-86 in drawPumpPad) at EVERY zoom and
    // viewport. A us-scaled screen lift shrank to fewer world px on bigger canvases
    // and let the art poke through. The board still SCALES with zoom (ds tracks
    // srUiScale inside the flap below); only its vertical anchor moved to world space.
    var base = srWorldToScreen(sellReveal.fwx, sellReveal.fwy - 132);
    var fx = base.x, fy = base.y;
    ctx.save();
    ctx.globalAlpha = fade;
    srDrawFinaleFlap(fx, fy, age, sellReveal.grand);
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  function srDrawFinaleFlap(fx, fy, age, grand) {
    var base = ctx.globalAlpha;
    var num = '$' + grand.toLocaleString();   // e.g. "$5,642"
    // classify the figure into columns
    var cols = [], nDig = 0;
    for (var ci = 0; ci < num.length; ci++) {
      var c = num.charAt(ci);
      if (c === '$') cols.push({ t: 'pre' });
      else if (c === ',') cols.push({ t: 'sep' });
      else { cols.push({ t: 'dig', ch: c, seq: nDig }); nDig++; }
    }

    // ---- sizing: start from the zoom-proportional scale, then shrink if too wide ----
    var us = srUiScale();
    var ds = Math.max(2, Math.round(4 * us)), gW, slotW, slotH, gap = 3, sepW, preW, rowW;
    function measure(s) {
      gW = 5 * s; slotW = gW + 8; slotH = 7 * s + 12; sepW = 3 * s; preW = gW;
      var w = 0;
      for (var i = 0; i < cols.length; i++) {
        if (i > 0) w += gap;
        w += cols[i].t === 'pre' ? preW : cols[i].t === 'sep' ? sepW : slotW;
      }
      rowW = w;
    }
    measure(ds);
    while (ds > 2 && rowW > viewW * 0.78) { ds--; measure(ds); }
    var glyphH = 7 * ds;

    // ---- header + housing geometry (matches the HUD brass instruments) ----
    var hScale = ds >= 3 ? 2 : 1;
    var header = 'TOTAL FROM LOAD', headH = 7 * hScale;
    var hW = stencilTextWidth(header, hScale);
    var pad = 9, headGap = 7, contentW = Math.max(rowW, hW);
    var faceW = contentW + pad * 2;
    var faceH = pad + headH + headGap + slotH + pad;
    var hx = Math.round(fx - faceW * 0.5) - 3, hy = Math.round(fy - faceH * 0.5) - 3;
    var hw = faceW + 6, hh = faceH + 6;
    // No on-screen clamp: the board is WORLD-pinned (srDrawFinale anchors it via
    // srWorldToScreen), so it may scroll off-screen when the player flies away from
    // the dock, exactly like the world-pinned cards + chips.

    // a quick opaque fade-in (the cards are already cleared by srFloatAlpha)
    ctx.globalAlpha = base * srClamp(age / 120, 0, 1);

    // ---- outer dark steel bezel ----
    ctx.fillStyle = '#14171d'; ctx.fillRect(hx, hy, hw, hh);
    ctx.fillStyle = '#2a3140'; ctx.fillRect(hx, hy, hw, 1); ctx.fillRect(hx, hy, 1, hh);
    ctx.fillStyle = '#000000'; ctx.fillRect(hx, hy + hh - 1, hw, 1); ctx.fillRect(hx + hw - 1, hy, 1, hh);
    // ---- bronze inset ring ----
    var rxi = hx + 2, ryi = hy + 2, rwi = hw - 4, rhi = hh - 4;
    ctx.fillStyle = '#5a3e1c'; ctx.fillRect(rxi, ryi, rwi, rhi);
    ctx.fillStyle = '#8a6428'; ctx.fillRect(rxi, ryi, rwi, 1);
    ctx.fillStyle = '#3a2810'; ctx.fillRect(rxi, ryi + rhi - 1, rwi, 1);
    // ---- brushed brass face ----
    var ax = rxi + 1, ay = ryi + 1, aw = rwi - 2, ah = rhi - 2;
    ctx.fillStyle = '#7a5a2c'; ctx.fillRect(ax, ay, aw, ah);
    for (var sxl = ax + 1; sxl < ax + aw - 1; sxl += 3) { ctx.fillStyle = 'rgba(160,124,64,0.18)'; ctx.fillRect(sxl, ay + 1, 1, ah - 2); }
    for (var sx2 = ax + 2; sx2 < ax + aw - 1; sx2 += 5) { ctx.fillStyle = 'rgba(48,32,12,0.22)'; ctx.fillRect(sx2, ay + 1, 1, ah - 2); }
    ctx.fillStyle = '#a07c40'; ctx.fillRect(ax, ay, aw, 1); ctx.fillRect(ax, ay, 1, ah);
    ctx.fillStyle = '#4f3a1b'; ctx.fillRect(ax, ay + ah - 1, aw, 1); ctx.fillRect(ax + aw - 1, ay, 1, ah);
    // corner screws
    function flapScrew(cx, cy) { ctx.fillStyle = '#1a1006'; ctx.fillRect(cx - 1, cy - 1, 3, 3); ctx.fillStyle = '#9c7a40'; ctx.fillRect(cx, cy, 1, 1); }
    flapScrew(ax + 2, ay + 2); flapScrew(ax + aw - 3, ay + 2);
    flapScrew(ax + 2, ay + ah - 3); flapScrew(ax + aw - 3, ay + ah - 3);

    // ---- header: etched stencil on brass (the game's label colour) ----
    drawStencilText(header, ax + Math.round((aw - hW) / 2), ay + pad, hScale, '#3a2810');

    // ---- chrome cluster bezel around the readout row ----
    var rowX = ax + Math.round((aw - rowW) / 2);
    var slotY = ay + pad + headH + headGap;
    var clX = rowX - 3, clY = slotY - 2, clW = rowW + 6, clH = slotH + 4;
    ctx.fillStyle = '#0a0604'; ctx.fillRect(clX, clY, clW, clH);
    ctx.fillStyle = '#3a2e1c'; ctx.fillRect(clX, clY, clW, 1); ctx.fillRect(clX, clY, 1, clH);
    ctx.fillStyle = '#000000'; ctx.fillRect(clX, clY + clH - 1, clW, 1); ctx.fillRect(clX + clW - 1, clY, 1, clH);

    // ---- columns ----
    var glyphY = slotY + Math.round((slotH - glyphH) / 2);
    var cx2 = rowX;
    for (var k = 0; k < cols.length; k++) {
      var col = cols[k];
      if (col.t === 'pre') { drawStencilGlyph('$', cx2, glyphY, ds, '#ffd24a'); cx2 += preW + gap; }
      else if (col.t === 'sep') { drawStencilGlyph(',', cx2, glyphY, ds, '#ffd24a'); cx2 += sepW + gap; }
      else {
        var fromRight = nDig - 1 - col.seq;
        var lockAt = fromRight * SR_FLAP_PER;
        srDrawFlapCell(cx2, slotY, slotW, slotH, ds, col.ch, age >= lockAt + SR_FLAP_SPIN, age, lockAt, col.seq);
        cx2 += slotW + gap;
      }
    }
    ctx.globalAlpha = base;
  }

  // one recessed split-flap slot: spins stencil digits while flipping, locks to a
  // gold figure with a brief 1px rim snap. Pure pixel ops, no shadowBlur glow.
  function srDrawFlapCell(x, y, w, h, ds, glyph, locked, age, lockAt, idx) {
    x = Math.round(x); y = Math.round(y);
    var gW = 5 * ds, gH = 7 * ds, step = gH + 2 * ds;
    var gx = Math.round(x + (w - gW) / 2), gy = Math.round(y + (h - gH) / 2);
    // recessed slot (depth-drum vocabulary)
    ctx.fillStyle = '#0e0a04'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#000000'; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
    ctx.fillStyle = '#241808'; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);

    ctx.save();
    ctx.beginPath(); ctx.rect(x + 1, y + 1, w - 2, h - 2); ctx.clip();
    if (locked) {
      drawStencilText(glyph, gx, gy, ds, '#ffd24a');
      var dv = parseInt(glyph, 10);
      if (!isNaN(dv)) {
        drawStencilText(String((dv + 9) % 10), gx, gy - step, ds, 'rgba(212,168,56,0.22)');
        drawStencilText(String((dv + 1) % 10), gx, gy + step, ds, 'rgba(212,168,56,0.22)');
      }
    } else {
      // continuous fast spin; desynced per column so the board doesn't move in lockstep
      var spinPos = age * 0.06 + idx * 2.3;
      var di = Math.floor(spinPos) % 10, off = Math.round((spinPos - Math.floor(spinPos)) * step);
      drawStencilText(String((di + 1) % 10), gx, gy - off + step, ds, 'rgba(232,196,96,0.85)');
      drawStencilText(String(di), gx, gy - off, ds, 'rgba(232,196,96,0.85)');
      drawStencilText(String((di + 9) % 10), gx, gy - off - step, ds, 'rgba(232,196,96,0.85)');
    }
    ctx.restore();

    // split-flap fold seam across the middle
    var midY = y + Math.floor(h / 2);
    ctx.fillStyle = '#000000'; ctx.fillRect(x + 1, midY, w - 2, 1);
    ctx.fillStyle = 'rgba(160,124,64,0.20)'; ctx.fillRect(x + 1, midY + 1, w - 2, 1);
    // glass sheen (drum vocabulary)
    ctx.fillStyle = 'rgba(220,235,255,0.16)'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillStyle = 'rgba(220,235,255,0.08)'; ctx.fillRect(x + 1, y + 2, 1, h - 3);
    // lock-snap: a brief gold rim the instant the digit lands (no glow)
    if (locked) {
      var snap = srClamp(1 - (age - (lockAt + 150)) / 170, 0, 1);
      if (snap > 0.02) {
        ctx.fillStyle = 'rgba(255,210,74,' + (0.6 * snap).toFixed(3) + ')';
        ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
        ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
      }
    }
  }

  function drawSellReveal() {
    if (!sellReveal && !srFloats.length && !srParts.length) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // full-screen CSS-pixel space
    ctx.imageSmoothingEnabled = false;
    // World-pinned PER ENTITY: each card + chip stored the rig's feet in WORLD coords
    // at the instant its beat fired (wax/way). srWorldToScreen re-projects that with the
    // LIVE cam + worldScale every frame, so payouts pop where the rig WAS, stay glued to
    // that dock spot as the player roams to the next beat, and a mid-reveal zoom keeps
    // them in place (no corner-snap). The card lift + size ride the live srUiScale().
    srDrawTelegraph();
    srDrawChips();
    // placards last so they sit above the spilled chips; each pops, drifts up to
    // make room for the next, then fades. No top clip-guard: a world-pinned card is
    // allowed to scroll off if the player flies away from the dock.
    for (var i = 0; i < srFloats.length; i++) {
      var fc = srFloats[i];
      var a = srFloatAlpha(fc);
      if (a <= 0.002) continue;
      var us = srUiScale();
      var base = srWorldToScreen(fc.wax, fc.way);
      var ox = base.x;
      var oy = base.y - (96 + srFloatRiseAt(srNow - fc.born)) * us; // hover above the feet, drift up
      ctx.globalAlpha = a;
      srDrawCardPlate(fc.it, ox, oy, srCardScale(fc) * us); // *us = grow with zoom
      ctx.globalAlpha = 1;
    }
    // grand-total board floats above the rig's live spot (srDrawFinale), clamped fully
    // on-screen so it reads as the closing summary hovering over the dock.
    srDrawFinale();
    ctx.restore();
  }

