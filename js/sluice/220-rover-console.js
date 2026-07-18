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

  // Stenciled bay-edge label drawn into the top inset of the bay.
  // v25.63 — fit the label to the bay width. In the stacked (portrait-phone)
  // console the bays are far narrower than the ~92-110px the labels were authored
  // for, so a value-bearing header ('CARGO  $45,347') centred at scale 1 spilled
  // out both sides (into the gutter and the neighbouring bay). Shrink the stencil
  // scale just enough to fit, floored so it stays legible; short labels ('FUEL',
  // 'RESERVE') still fit at scale 1 and are untouched.
  function drawBayLabel(bx, by, bw, text) {
    var avail = bw - 7;
    var w = stencilTextWidth(text, 1);
    var s = (w > avail && w > 0) ? Math.max(0.6, avail / w) : 1;
    var wS = stencilTextWidth(text, s);
    drawStencilText(text, bx + Math.floor((bw - wS) / 2), by + 2, s, '#d8d2c4');
  }

  // (v26.43: the four per-bay corner bolts are gone. Six bays x four bolts
  // was a field of dots; the frame's edge rivets carry the industrial read.)

  // ===== v11.4 — Console instruments (UI_STYLE.md §5) =====

  // §5.1 Fuel dial + reserve rack, one bay (v26.43). The brass-era needle
  // gauge is retired; this is a dark-face half-dial behind glass, the one
  // round instrument on the rail, so it anchors the cluster's left end.
  // Keeps the green/amber/red margin arc (§6 amendment), the light-print
  // ticks, and the fuel-to-climb-home marker. The old RESERVE bay folds in
  // as a column of spare-tank pips on the right edge: lit amber when a tank
  // is racked, a dark socket when not (§4.3: silence is OK).
  function drawFuelGauge(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'FUEL');
    var pipZone = 16;                     // right-edge column for the reserve rack
    var win = instrWindow(bx + 3, by + 11, bw - 6, bh - 14);
    var cx = bx + 3 + Math.round((bw - 6 - pipZone) / 2);
    var cy = win.y + win.h - 5;
    // Floor at 8 so the inner arcs stay positive through resize transients.
    var rad = Math.max(8, Math.min((bw - pipZone) * 0.44, bh * 0.58));

    // -------- Machined bezel ring + dial face --------
    ctx.strokeStyle = UI_OUTLINE;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, rad + 2, Math.PI - 0.04, 0.04); ctx.stroke();
    ctx.strokeStyle = UIMAT_PLATE_HIGHLIGHT;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, rad + 2.5, Math.PI + 0.28, Math.PI + 0.85); ctx.stroke();
    ctx.fillStyle = '#0a0d12';
    ctx.beginPath(); ctx.arc(cx, cy, rad + 1, Math.PI, 0); ctx.closePath(); ctx.fill();

    // -------- Margin arc: green / amber / red, printed not glowing --------
    function zoneArc(from, to, color) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad - 3, Math.PI + Math.PI * from, Math.PI + Math.PI * to);
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    zoneArc(0.00, 0.15, '#c2402c');
    zoneArc(0.15, 0.30, '#c08a28');
    zoneArc(0.30, 1.00, '#3f9052');

    // -------- Ticks: light print on the dark face --------
    var maxFuelLocal = (typeof maxFuel === 'number' && maxFuel > 0) ? maxFuel : 30;
    var fuelFrac = (typeof player !== 'undefined' && player) ? Math.max(0, Math.min(1, player.fuel / maxFuelLocal)) : 0;
    for (var t = 0; t <= 4; t++) {
      var ang = Math.PI + Math.PI * (t / 4);
      ctx.strokeStyle = 'rgba(216,210,196,0.85)';
      ctx.lineWidth = (t === 0 || t === 4) ? 1.6 : 1.1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (rad - 6), cy + Math.sin(ang) * (rad - 6));
      ctx.lineTo(cx + Math.cos(ang) * (rad - 10), cy + Math.sin(ang) * (rad - 10));
      ctx.stroke();
      if (t < 4) {
        ctx.strokeStyle = 'rgba(216,210,196,0.30)';
        ctx.lineWidth = 1;
        for (var st = 1; st <= 3; st++) {
          var sang = Math.PI + Math.PI * ((t + st / 4) / 4);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(sang) * (rad - 6), cy + Math.sin(sang) * (rad - 6));
          ctx.lineTo(cx + Math.cos(sang) * (rad - 8.5), cy + Math.sin(sang) * (rad - 8.5));
          ctx.stroke();
        }
      }
    }
    drawStencilText('E', cx - rad + 13, cy - 8, 1, 'rgba(216,210,196,0.55)');
    drawStencilText('F', cx + rad - 17, cy - 8, 1, 'rgba(216,210,196,0.55)');

    // -------- Needle: cream with a red tip over a 1-px drop shadow --------
    var needleAng = Math.PI + Math.PI * fuelFrac;
    var nLen = rad - 6;
    var nx = cx + Math.cos(needleAng) * nLen;
    var ny = cy + Math.sin(needleAng) * nLen;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx + 1, cy + 1); ctx.lineTo(nx + 1, ny + 1); ctx.stroke();
    ctx.strokeStyle = '#e8e0cc';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
    var tipX0 = cx + Math.cos(needleAng) * (nLen - 4);
    var tipY0 = cy + Math.sin(needleAng) * (nLen - 4);
    ctx.strokeStyle = '#ff5436';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(tipX0, tipY0); ctx.lineTo(nx, ny); ctx.stroke();
    ctx.lineCap = 'butt';

    // -------- Hub: flush steel --------
    ctx.fillStyle = UI_OUTLINE;
    ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = UIMAT_PLATE_BASE;
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT;
    ctx.fillRect(cx - 1, cy - 2, 1, 1);

    // -------- "Fuel to climb home" marker (kept from v24) --------
    // The notch slides along the dial as depth changes; keep the needle above
    // it and you can make it back. Turns red the moment you can't.
    var toSurface = getFuelToSurface();
    if (toSurface > 0.5) {
      var markFrac = Math.min(1, toSurface / maxFuelLocal);
      var mAng = Math.PI + Math.PI * markFrac;
      var mCos = Math.cos(mAng), mSin = Math.sin(mAng);
      var mCol = player.fuel >= toSurface ? '#bfe9ff' : '#ff5436';
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#05070a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx + mCos * (rad - 1), cy + mSin * (rad - 1));
      ctx.lineTo(cx + mCos * (rad - 9), cy + mSin * (rad - 9));
      ctx.stroke();
      ctx.strokeStyle = mCol;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + mCos * (rad - 2), cy + mSin * (rad - 2));
      ctx.lineTo(cx + mCos * (rad - 8), cy + mSin * (rad - 8));
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#05070a';
      ctx.beginPath();
      ctx.arc(cx + mCos * (rad + 2), cy + mSin * (rad + 2), 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mCol;
      ctx.beginPath();
      ctx.arc(cx + mCos * (rad + 2), cy + mSin * (rad + 2), 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // -------- Glass: one top-left reflection arc (§4.4) --------
    ctx.strokeStyle = 'rgba(220,235,255,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, rad - 1.5, Math.PI + 0.22, Math.PI + 0.62); ctx.stroke();

    // -------- Warning lamp (top-left of the glass) --------
    var lampState = 'off';
    if (fuelFrac < 0.15)      lampState = 'critical';
    else if (fuelFrac < 0.30) lampState = 'caution';
    drawWarningLamp(win.x + 6, win.y + 6, lampState);

    // -------- Reserve rack: spare-tank pips down the right edge --------
    var have = (typeof reserveFuel === 'number') ? reserveFuel : 0;
    var n = (typeof RESERVE_FUEL_MAX === 'number') ? RESERVE_FUEL_MAX : 4;
    var pgap = 2;
    var ph = Math.min(10, Math.floor((win.h - 6 - (n - 1) * pgap) / n));
    var pw = 9;
    var px0 = win.x + win.w - pw - 3;
    var py0 = win.y + Math.max(3, Math.round((win.h - (n * (ph + pgap) - pgap)) / 2));
    for (var i = 0; i < n; i++) {
      drawReservePip(px0, py0 + i * (ph + pgap), pw, ph, i < have);
    }
  }

  // One reserve-tank pip for the FUEL bay: a tiny jerry can, lit amber when
  // racked, a dark socket when empty.
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

  // §5.1b Speed readout — the rig's |velocity| as a big lit MPH number
  // behind glass, converted exactly as the 'FELL n MPH' fall readout does
  // (32 px = 1 m, m/s → MPH) so the two always agree. The number is eased
  // toward the reading so it ticks instead of strobing, and it warms amber →
  // orange → red as you climb into fall-damage territory; the corner lamp
  // echoes it and stays dark below the caution band (§6: silence is OK).
  var speedoMphSmooth = 0;
  // Per-frame speedo ease (v25.31): runs from drawConsole EVERY frame, cache
  // hit or not — an ease inside the cached draw freezes on cache hits.
  function consoleTickSpeedo() {
    var spd = (typeof player !== 'undefined' && player)
      ? Math.sqrt(player.vx * player.vx + player.vy * player.vy) : 0;
    var mphNow = spd / 32 * 2.237;
    speedoMphSmooth += (mphNow - speedoMphSmooth) * 0.18;
    if (speedoMphSmooth < 0.05) speedoMphSmooth = 0;
  }
  function drawSpeedDisplay(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'SPEED');
    var win = instrWindow(bx + 3, by + 11, bw - 6, bh - 14);
    var spdMax = (typeof SPEEDO_MPH_MAX === 'number' && SPEEDO_MPH_MAX > 0) ? SPEEDO_MPH_MAX : 80;
    var spdFrac = Math.max(0, Math.min(1, speedoMphSmooth / spdMax));
    var numCol = '#d4a838';
    if (spdFrac >= 0.82)      numCol = '#ff5436';
    else if (spdFrac >= 0.60) numCol = '#f0902a';
    var mphStr = '' + Math.round(speedoMphSmooth);
    var hasLegend = win.h >= 40;
    var numH = win.h - (hasLegend ? 10 : 0);
    // Largest stencil scale (3 → 2 → 1) that fits the glass in both axes.
    var scale = 3;
    if (stencilTextWidth(mphStr, scale) > win.w - 10 || 7 * scale > numH - 4) scale = 2;
    if (stencilTextWidth(mphStr, scale) > win.w - 10 || 7 * scale > numH - 4) scale = 1;
    var tw = stencilTextWidth(mphStr, scale);
    drawStencilText(mphStr, win.x + Math.floor((win.w - tw) / 2),
      win.y + Math.floor((numH - 7 * scale) / 2) + 1, scale, numCol);
    if (hasLegend) {
      var lgW = stencilTextWidth('MPH', 1);
      drawStencilText('MPH', win.x + Math.floor((win.w - lgW) / 2), win.y + win.h - 10, 1, '#454f5c');
    }
    // Redline lamp: dark until the caution band (no green "OK" light, §6).
    var lampState = spdFrac >= 0.82 ? 'critical' : (spdFrac >= 0.60 ? 'caution' : 'off');
    drawWarningLamp(win.x + win.w - 6, win.y + 6, lampState);
  }

  // §5.2 Plate counter — positional health zones (UI_STYLE.md §5.2 +
  // §6 amendment). 8 armor plates colored green/amber/red by POSITION,
  // not by current hull value. Damage takes plates from the right;
  // a full hull shows the whole gradient, a critical hull shows only
  // the green plates left. The color zones themselves communicate
  // remaining margin; no master warning lamp needed.
  function drawHullPlates(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'HULL');
    var win = instrWindow(bx + 3, by + 11, bw - 6, bh - 14);   // v26.43 aperture
    // v25.71 — the hull gauge is a GRID of armor tiles, and the tile COUNT tracks
    // the Hull Plating upgrade: a stock rig has HULL_PLATE_BASE tiles and each tier
    // bolts on HULL_PLATE_STEP more, so a maxed hull reads as a visibly denser slab
    // of plating (not just a bigger, invisible hull number). The grid auto-sizes its
    // tiles + row count to fit the 92 px bay at any total. Tiles still drop from the
    // END (bottom-right) as damage lands and keep the green/amber/red margin zones,
    // so a battered hull is down to its solid green core up top.
    var HULL_PLATE_BASE = 6;   // tiles at hull level 1
    var HULL_PLATE_STEP = 3;   // extra tiles per upgrade tier (L1=6 .. L7=24)
    var hullLvl = (typeof upgrades !== 'undefined' && upgrades && upgrades.hullLevel) ? upgrades.hullLevel : 1;
    var n = HULL_PLATE_BASE + (Math.max(1, hullLvl) - 1) * HULL_PLATE_STEP;
    if (n > 30) n = 30;        // safety clamp (dev free-buy over-levelling)

    var maxHullLocal = (typeof getMaxHull === 'function') ? getMaxHull() : 100;
    var hullFrac = (typeof player !== 'undefined' && player) ? Math.max(0, Math.min(1, player.hull / maxHullLocal)) : 0;
    var intactPlates = Math.ceil(hullFrac * n);

    // Position zones by tile index: green core (low) -> amber -> red margin (high).
    var nRed    = Math.max(1, Math.round(n * 0.15));
    var nAmber  = Math.max(1, Math.round(n * 0.25));
    var nGreen  = n - nRed - nAmber;
    function plateZoneColors(idx) {
      if (idx < nGreen)               return { base: '#40c060', hi: '#7be098', sh: '#268040' };
      else if (idx < nGreen + nAmber) return { base: '#e0a020', hi: '#ffd47a', sh: '#9c6010' };
      else                            return { base: '#e83a26', hi: '#ff7060', sh: '#7a2418' };
    }

    // Fit N tiles into the glass: the largest square tile (<=11 px) whose
    // wrapped rows fit the window. Small counts stay chunky in one or two
    // rows; a maxed hull packs into a denser multi-row grid.
    var gap = 1;
    var availW = win.w - 8;
    var availH = Math.max(6, win.h - 6);
    var tile = 4, cols = 1, rows = n;
    for (var t = 11; t >= 4; t--) {
      var c = Math.max(1, Math.floor((availW + gap) / (t + gap)));
      var r = Math.ceil(n / c);
      if (r * (t + gap) - gap <= availH) { tile = t; cols = c; rows = r; break; }
      if (t === 4) { tile = 4; cols = c; rows = r; }
    }
    var gridW = cols * (tile + gap) - gap;
    var gridH = rows * (tile + gap) - gap;
    var gx0 = win.x + Math.round((win.w - gridW) / 2);
    var gy0 = win.y + 3 + Math.max(0, Math.round((availH - gridH) / 2));
    // (Destroyed tiles show the dark glass of the aperture through.)

    for (var i = 0; i < n; i++) {
      var stage;
      if (i < intactPlates - 1) stage = 0;
      else if (i === intactPlates - 1) {
        var subFrac = (hullFrac * n) - (intactPlates - 1);
        stage = (subFrac > 0.4) ? 0 : 1;   // the draining tile cracks before it drops
      } else stage = 3;
      if (stage === 3) continue;

      var col = i % cols;
      var row = (i / cols) | 0;
      var px = gx0 + col * (tile + gap);
      var py = gy0 + row * (tile + gap);
      var z = plateZoneColors(i);

      ctx.fillStyle = z.base;                // tile body
      ctx.fillRect(px, py, tile, tile);
      ctx.fillStyle = z.hi;                  // top + left highlight
      ctx.fillRect(px, py, tile, 1);
      ctx.fillRect(px, py, 1, tile);
      ctx.fillStyle = z.sh;                  // bottom + right shadow
      ctx.fillRect(px, py + tile - 1, tile, 1);
      ctx.fillRect(px + tile - 1, py, 1, tile);
      ctx.fillStyle = UI_OUTLINE;            // centre rivet (industrial read)
      ctx.fillRect(px + (tile >> 1), py + (tile >> 1), 1, 1);

      if (stage >= 1) {                      // cracked: a scatter of dark hits
        ctx.fillStyle = UI_OUTLINE;
        ctx.fillRect(px + 2, py + 2, 1, 1);
        ctx.fillRect(px + tile - 3, py + tile - 4, 1, 1);
      }
    }
  }

  // §5.3 Bay window — sized slots. Interior is divided into exactly
  // maxCargo cells (auto-arranged into a roughly square grid that
  // fills the chamber). Each cell is one cargo slot, fills bottom-
  // first as the player mines. Empty cells show the dark interior;
  // filled cells show the ORES[k].color of the held ore. Big cells
  // when capacity is small, smaller cells when you've upgraded.
  function drawCargoBay(bx, by, bw, bh) {
    // v11.36 — bay header shows live total cargo value beside the CARGO
    // label, ticking up as you mine ore and resetting when you sell.
    var cargoVal = 0;
    if (typeof cargo !== 'undefined' && cargo && typeof ORES !== 'undefined') {
      for (var cvi = 0; cvi < cargo.length; cvi++) {
        cargoVal += cargoUnitValue(cargo[cvi]);
      }
    }
    var lblStr = cargoVal > 0 ? ('CARGO  $' + cargoVal.toLocaleString()) : 'CARGO';
    drawBayLabel(bx, by, bw, lblStr);
    // v26.43 — the hold sits behind the shared aperture glass; the brass
    // chamber frame is gone.
    var win = instrWindow(bx + 3, by + 11, bw - 6, bh - 14);
    var ix = win.x + 1;
    var iy = win.y + 1;
    var iw = win.w - 2;
    var ih = win.h - 2;

    // Decide grid: pick cols/rows that produce roughly square cells
    // and fill the chamber. Aim cell ratio close to 1.
    var maxC = (typeof maxCargo === 'number' && maxCargo > 0) ? maxCargo : 5;
    var cargoArr = (typeof cargo !== 'undefined' && cargo) ? cargo : [];
    var bestCols = 1, bestRows = maxC, bestScore = Infinity;
    for (var cc = 1; cc <= maxC; cc++) {
      var rr = Math.ceil(maxC / cc);
      if (cc * rr < maxC) continue;
      var cw = iw / cc;
      var ch = ih / rr;
      // score = how non-square the cell is (lower better) + slight
      // preference for filling all cells (avoid trailing empties)
      var aspect = Math.max(cw, ch) / Math.max(0.001, Math.min(cw, ch));
      var waste = (cc * rr) - maxC;          // unused cells
      var score = aspect + waste * 0.2;
      if (score < bestScore) { bestScore = score; bestCols = cc; bestRows = rr; }
    }
    var cols = bestCols, rows = bestRows;
    var gap = Math.max(1, Math.floor(Math.min(iw, ih) / 60));
    var cellW = Math.floor((iw - gap * (cols + 1)) / cols);
    var cellH = Math.floor((ih - gap * (rows + 1)) / rows);

    // Rectangle-packed hold: each mined unit is drawn as ONE solid block whose
    // footprint (in grid cells) scales with its slot cost, so a dense ore
    // (Unobtanium = 8) reads as a single big rectangle, not eight chips. Blocks
    // pack bottom-left first in mining order; leftover cells stay empty.
    // Footprint [w, h] per slot count, wide-leaning to suit the wide chamber.
    // Preferred footprint [w, h] per slot count, wide-leaning to suit the wide
    // chamber. Chunky blocks (no thin bars), so a rare ore reads as a slab.
    var SLOT_FOOTPRINT = { 1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2], 5: [3, 2], 6: [3, 2], 7: [4, 2], 8: [4, 2] };
    // Occupancy grid, row 0 = bottom.
    var occ = [];
    for (var orr = 0; orr < rows; orr++) { occ.push([]); for (var occ0 = 0; occ0 < cols; occ0++) occ[orr].push(false); }
    function fits(gr, gc, w, h) {
      if (gc + w > cols || gr + h > rows) return false;
      for (var rr2 = gr; rr2 < gr + h; rr2++) { for (var cc2 = gc; cc2 < gc + w; cc2++) { if (occ[rr2][cc2]) return false; } }
      return true;
    }
    function cellX(gc) { return ix + gap + gc * (cellW + gap); }
    function cellY(gr) { return iy + ih - gap - cellH - gr * (cellH + gap); }   // gr = rows from bottom
    // Place one unit: try its preferred block, then progressively flatter and
    // smaller rectangles down to 1x1, so a near-full bay still shows every ore
    // (a big block just degrades to a bar rather than vanishing). Lowest, then
    // leftmost gap wins, so the hold fills from the bottom like the old grid.
    function placeUnit(slots) {
      var cand = [], seen = {};
      function add(w, h) {
        w = Math.min(w, cols); h = Math.min(h, rows);
        if (w < 1 || h < 1) return;
        var key = w + 'x' + h; if (seen[key]) return; seen[key] = 1; cand.push([w, h]);
      }
      var t = SLOT_FOOTPRINT[slots] || [slots, 1];
      add(t[0], t[1]); add(t[1], t[0]);
      for (var w = Math.min(cols, slots); w >= 1; w--) add(w, Math.ceil(slots / w));
      add(1, 1);
      for (var ci = 0; ci < cand.length; ci++) {
        var cw = cand[ci][0], ch = cand[ci][1];
        for (var pr = 0; pr <= rows - ch; pr++) {
          for (var pc = 0; pc <= cols - cw; pc++) {
            if (!fits(pr, pc, cw, ch)) continue;
            for (var mr = pr; mr < pr + ch; mr++) { for (var mc = pc; mc < pc + cw; mc++) { occ[mr][mc] = true; } }
            return { gc: pc, gr: pr, w: cw, h: ch };
          }
        }
      }
      return null;   // grid completely full: this unit overflows off-view
    }
    var blocks = [];
    for (var bi = 0; bi < cargoArr.length; bi++) {
      var bcu = cargoArr[bi];
      var bslots = (typeof cargoUnitSlots === 'function') ? cargoUnitSlots(bcu) : 1;
      var pos = placeUnit(bslots);
      if (pos) { pos.cu = bcu; blocks.push(pos); }
    }

    // 1) Empty slot recesses for the whole grid, so unfilled capacity reads.
    for (var er = 0; er < rows; er++) {
      for (var ec = 0; ec < cols; ec++) {
        var rxx = cellX(ec), ryy = cellY(er);
        ctx.fillStyle = '#050505'; ctx.fillRect(rxx, ryy, cellW, cellH);
        ctx.fillStyle = '#000000'; ctx.fillRect(rxx, ryy, cellW, 1); ctx.fillRect(rxx, ryy, 1, cellH);
        ctx.fillStyle = '#1a1a1a'; ctx.fillRect(rxx, ryy + cellH - 1, cellW, 1); ctx.fillRect(rxx + cellW - 1, ryy, 1, cellH);
      }
    }

    // 2) Each ore as ONE solid block, spanning the inter-cell gaps so there are
    //    no internal gridlines within a single unit.
    var hoverOre = null, hoverCx = 0, hoverCellW = 0;
    for (var di = 0; di < blocks.length; di++) {
      var blk = blocks[di];
      var ore = (typeof ORES !== 'undefined' && ORES[cargoType(blk.cu)]) ? ORES[cargoType(blk.cu)] : null;
      var oreShiny = cargoShiny(blk.cu);
      var col = ore ? ore.color : '#888';
      var bxp = cellX(blk.gc);
      var byp = cellY(blk.gr + blk.h - 1);                        // top row of the block
      var bwp = blk.w * cellW + (blk.w - 1) * gap;
      var bhp = blk.h * cellH + (blk.h - 1) * gap;
      // Pointer hover: remember the ore the cursor is over (desktop).
      if (ore && typeof mouseCursor !== 'undefined' &&
          mouseCursor.x >= bxp && mouseCursor.x < bxp + bwp &&
          mouseCursor.y >= byp && mouseCursor.y < byp + bhp) {
        hoverOre = ore; hoverCx = bxp; hoverCellW = bwp;
      }
      // Ore body (inset 1 px so blocks keep a dark seam between them)
      ctx.fillStyle = col;
      ctx.fillRect(bxp + 1, byp + 1, bwp - 2, bhp - 2);
      // Highlight + shadow for material read
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(bxp + 1, byp + 1, bwp - 2, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(bxp + 1, byp + bhp - 2, bwp - 2, 1);
      if (oreShiny) {
        // shiny unit in the hold: warm-gold corner pip + bright top/left rim
        ctx.fillStyle = '#fff1b0';
        ctx.fillRect(bxp + bwp - 4, byp + 1, 3, 3);
        ctx.fillStyle = 'rgba(255,240,170,0.85)';
        ctx.fillRect(bxp + 1, byp + 1, bwp - 2, 1);
        ctx.fillRect(bxp + 1, byp + 1, 1, bhp - 2);
      }
    }

    // Hover tooltip — names the ore under the cursor. Drawn above the
    // bay so it never overlaps the slots; steel-framed to match.
    if (hoverOre) {
      ctx.save();
      var tipName = hoverOre.label || 'Ore';
      var tipSub = '$' + (hoverOre.value || 0);
      if (hoverOre.tooltip) tipSub += '   ' + hoverOre.tooltip;
      ctx.font = 'bold 10px ' + UI_FONT;
      var tnW = ctx.measureText(tipName).width;
      ctx.font = '8px ' + UI_FONT;
      var tsW = ctx.measureText(tipSub).width;
      var tipPad = 6;
      var tipW = Math.ceil(Math.max(tnW, tsW)) + tipPad * 2;
      var tipH = 30;
      var tipX = Math.round(hoverCx + hoverCellW / 2 - tipW / 2);
      if (tipX < bx - 6) tipX = bx - 6;
      if (tipX + tipW > bx + bw + 6) tipX = bx + bw + 6 - tipW;
      var tipY = Math.round(by - 4 - tipH);
      ctx.fillStyle = 'rgba(8,8,10,0.96)';
      ctx.fillRect(tipX, tipY, tipW, tipH);
      ctx.fillStyle = UIMAT_WELD;
      ctx.fillRect(tipX, tipY, tipW, 1);
      ctx.fillRect(tipX, tipY + tipH - 1, tipW, 1);
      ctx.fillRect(tipX, tipY, 1, tipH);
      ctx.fillRect(tipX + tipW - 1, tipY, 1, tipH);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold 10px ' + UI_FONT;
      ctx.fillStyle = '#f4ead0';
      ctx.fillText(tipName, tipX + tipPad, tipY + 13);
      ctx.font = '8px ' + UI_FONT;
      ctx.fillStyle = UIT_DIM;
      ctx.fillText(tipSub, tipX + tipPad, tipY + 24);
      ctx.restore();
    }
  }

  // §5.4 Depth odometer — four rolling drums behind glass. The drum slots,
  // ghost digit peeks and the odometer rim survive from v11; the brass face
  // around them is gone, so the drums sit straight in the dark window like
  // a counter set into the panel.
  function drawDepthDisplay(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'DEPTH');
    var win = instrWindow(bx + 3, by + 11, bw - 6, bh - 14);

    // Depth metres
    var depthM = 0;
    if (typeof player !== 'undefined' && player && typeof SKY_ROWS === 'number') {
      depthM = Math.max(0, ((player.y - SKY_ROWS * TILE) / TILE) | 0);
    }
    var sDepth = depthM.toFixed(0);
    while (sDepth.length < 4) sDepth = '0' + sDepth;

    // Drum slot geometry. v25.63: drop to scale 1 when the scale-2 cluster
    // won't fit the narrow portrait-stacked bay.
    var drumGap = 1;
    var nDigits = 4;
    var scale = 2;
    if ((5 * scale + 4) * nDigits + drumGap * (nDigits - 1) + 6 > win.w) scale = 1;
    var digitW = 5 * scale;
    var drumW = digitW + 4;
    var totalDrums = drumW * nDigits + drumGap * (nDigits - 1);
    var hasLegend = win.h >= 40;
    var drumH = 7 * scale + 6;
    var drumStartX = win.x + Math.floor((win.w - totalDrums) / 2);
    var drumY = win.y + Math.floor((win.h - (hasLegend ? 10 : 0) - drumH) / 2) + 1;

    // Per-digit drum: recessed near-black slot, amber digit, dim peeks of
    // the neighbouring digits top + bottom for the rolling-cylinder read.
    for (var d = 0; d < nDigits; d++) {
      var dx = drumStartX + d * (drumW + drumGap);
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(dx, drumY, drumW, drumH);
      ctx.fillStyle = '#000000';
      ctx.fillRect(dx, drumY, drumW, 1);
      ctx.fillRect(dx, drumY, 1, drumH);
      ctx.fillStyle = '#1c222b';
      ctx.fillRect(dx, drumY + drumH - 1, drumW, 1);
      ctx.fillRect(dx + drumW - 1, drumY, 1, drumH);

      var ch = sDepth.charAt(d);
      var digit = parseInt(ch, 10);
      var cdx = dx + Math.floor((drumW - digitW) / 2);
      var cdy = drumY + Math.floor((drumH - 7 * scale) / 2);
      drawStencilText(ch, cdx, cdy, scale, '#d4a838');

      var above = String((digit + 9) % 10);
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx + 1, drumY + 1, drumW - 2, 3);
      ctx.clip();
      drawStencilText(above, cdx, cdy - 7 * scale - 2, scale, 'rgba(212, 168, 56, 0.30)');
      ctx.restore();

      var below = String((digit + 1) % 10);
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx + 1, drumY + drumH - 4, drumW - 2, 3);
      ctx.clip();
      drawStencilText(below, cdx, cdy + 7 * scale + 2, scale, 'rgba(212, 168, 56, 0.30)');
      ctx.restore();

      // Glass sheen on the slot
      ctx.fillStyle = 'rgba(220,235,255,0.16)';
      ctx.fillRect(dx + 1, drumY + 1, drumW - 2, 1);
    }

    // Odometer rim between drums (steel, not brass)
    var sepX = drumStartX + drumW * 2 + drumGap;
    ctx.fillStyle = UIMAT_WELD;
    ctx.fillRect(sepX - 1, drumY - 1, 1, drumH + 2);

    // Etched-glass legend under the drums
    if (hasLegend) {
      var lgW = stencilTextWidth('METRES', 1);
      drawStencilText('METRES', win.x + Math.floor((win.w - lgW) / 2), win.y + win.h - 10, 1, '#454f5c');
    }
  }

  // (v26.43: the SAVE annunciator bay is gone; the lamp lives in the CASH
  // window now, drawn in drawCashDisplay. State stays in 047-save.js.)

  // §5.5 Cash readout — the balance in money gold behind glass, right-
  // aligned. Shows displayMoney (the eased odometer) so a dock sale counts
  // up beat-by-beat; the per-card payout punch (cashPunch, set in srFireBeat,
  // decayed in update()) washes the window, flashes the figure warm-white
  // and pulses the rim. The SAVE bay (v24.126) collapsed into the annunciator
  // lamp in this window's top-left corner: dark when idle (§10.7 silence),
  // steady info-blue for ~3 s after each save write, hard 1 Hz caution blink
  // while writes fail. Lamp state lives in 047-save.js.
  function drawCashDisplay(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'CASH');
    var win = instrWindow(bx + 3, by + 11, bw - 6, bh - 14);
    var hasLegend = win.h >= 40;

    // Payout wash — each beat lights the glass gold
    var punch = (typeof cashPunch === 'number' && cashPunch > 0) ? Math.min(1, cashPunch) : 0;
    if (punch > 0.01) {
      ctx.fillStyle = 'rgba(255,226,122,' + (0.30 * punch).toFixed(3) + ')';
      ctx.fillRect(win.x, win.y, win.w, win.h);
    }

    var bankShown = (typeof displayMoney === 'number' && isFinite(displayMoney)) ? displayMoney : money;
    var cashAmt = (typeof bankShown === 'number' && isFinite(bankShown)) ? Math.floor(bankShown) : 0;
    var cashStr = '$' + cashAmt.toLocaleString();
    var numH = win.h - (hasLegend ? 10 : 0);
    // Largest stencil scale that fits; fractional floor so a 7-figure
    // balance never clips the narrow portrait bay (v25.63).
    var scale = stencilTextWidth(cashStr, 2) <= win.w - 6 ? 2 : 1;
    if (stencilTextWidth(cashStr, scale) > win.w - 8) {
      scale = Math.max(0.6, (win.w - 8) / stencilTextWidth(cashStr, 1));
    }
    var tw = stencilTextWidth(cashStr, scale);
    var tx = win.x + win.w - 5 - tw;
    if (tx < win.x + 4) tx = win.x + 4;
    var ty = win.y + Math.floor((numH - 7 * scale) / 2) + 1;
    drawStencilText(cashStr, tx, ty, scale, '#ffd24a');
    if (punch > 0.01) {
      ctx.globalAlpha = punch;
      drawStencilText(cashStr, tx, ty, scale, '#fff4d0');
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,210,74,' + (0.55 * punch).toFixed(3) + ')';
      ctx.fillRect(win.x, win.y, win.w, 1);
      ctx.fillRect(win.x, win.y + win.h - 1, win.w, 1);
      ctx.fillRect(win.x, win.y, 1, win.h);
      ctx.fillRect(win.x + win.w - 1, win.y, 1, win.h);
    }
    if (hasLegend) {
      var lgW = stencilTextWidth('BALANCE', 1);
      drawStencilText('BALANCE', win.x + Math.floor((win.w - lgW) / 2), win.y + win.h - 10, 1, '#454f5c');
    }

    // ---- SAVE annunciator (top-left corner of the glass, §4.3) ----
    var scx = win.x + 6, scy = win.y + 6;
    ctx.fillStyle = UI_OUTLINE;
    ctx.fillRect(scx - 3, scy - 3, 7, 7);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(scx - 2, scy - 2, 5, 5);
    var lit = false, core, halo, lampA = 1;
    if (typeof saveLampFailT === 'number' && saveLampFailT > 0) {
      lit = (saveLampFailT % 1) < 0.5;          // hard 1 Hz caution blink
      core = '#ffb030'; halo = '#b06010';
    } else if (typeof saveLampT === 'number' && saveLampT > 0) {
      lit = true;                                // steady info, short fade tail
      core = '#4080ff'; halo = '#1c3a80';
      lampA = Math.min(1, saveLampT / 0.5);
    }
    if (lit) {
      ctx.save();
      ctx.globalAlpha = lampA;
      ctx.fillStyle = halo; ctx.fillRect(scx - 2, scy - 2, 5, 5);
      ctx.fillStyle = core; ctx.fillRect(scx - 1, scy - 1, 3, 3);
      ctx.fillStyle = '#cfe0ff'; ctx.fillRect(scx, scy, 1, 1);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(scx - 1, scy - 1, 3, 3);
    }

    // v25.37 — the dock-sale reveal draws in the full-screen HUD pass
    // (140-render-maindraw.js, right after drawConsole()), never here: the
    // instrument cache repaints this bay only on value changes and would
    // freeze an animation drawn from inside it.
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

