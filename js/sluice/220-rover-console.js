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

  // Small hex bolt for the corner of any instrument (3×3 px).
  function drawHexBolt(x, y) {
    ctx.fillStyle = UI_OUTLINE;
    ctx.fillRect(x - 1, y - 1, 3, 3);
    ctx.fillStyle = UIMAT_RIVET_CORE;
    ctx.fillRect(x, y, 1, 1);
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
  function drawBayLabel(bx, by, bw, text) {
    var w = stencilTextWidth(text, 1);
    drawStencilText(text, bx + Math.floor((bw - w) / 2), by + 2, 1, '#d8d2c4');
  }

  // Four corner bolts inside a bay's inner rect.
  function drawBayBolts(bx, by, bw, bh) {
    drawHexBolt(bx + 2,        by + 2);
    drawHexBolt(bx + bw - 3,   by + 2);
    drawHexBolt(bx + 2,        by + bh - 3);
    drawHexBolt(bx + bw - 3,   by + bh - 3);
  }

  // ===== v11.4 — Console instruments (UI_STYLE.md §5) =====

  // §5.1 Needle gauge — fully dressed. Multi-ring brass bezel,
  // colored zone scale arc (green/amber/red per §6 amendment),
  // numerated ticks at 25/50/75, pressure-relief screw, brass wear
  // marks, glass dome with two highlight arcs, status lamp.
  function drawFuelGauge(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'FUEL');
    drawBayBolts(bx, by, bw, bh);
    var cx = bx + bw / 2;
    var cy = by + bh - 8;
    // Floor at 8 so the inner-most arc (rad - 4) can't go negative when the
    // bay is laid out tiny (e.g. a near-zero viewport during a resize
    // transient). A negative arc radius throws and floods the console.
    var rad = Math.max(8, Math.min(bw * 0.42, bh * 0.66));

    // -------- Multi-ring bezel --------
    // Outer dark steel ring
    ctx.fillStyle = '#1a1408';
    ctx.beginPath();
    ctx.arc(cx, cy, rad + 3, Math.PI - 0.05, 0.05);
    ctx.closePath();
    ctx.fill();
    // Bronze/brass bezel
    ctx.fillStyle = '#5a4220';
    ctx.beginPath();
    ctx.arc(cx, cy, rad + 1, Math.PI - 0.03, 0.03);
    ctx.closePath();
    ctx.fill();
    // Brass face
    ctx.fillStyle = '#7a5a2c';
    ctx.beginPath();
    ctx.arc(cx, cy, rad, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    // Brass wear marks (5 fixed diagonal scratches — deterministic)
    var scratches = [
      [-rad * 0.55,  rad * 0.18, -rad * 0.45,  rad * 0.05],
      [-rad * 0.20, -rad * 0.30, -rad * 0.10, -rad * 0.42],
      [ rad * 0.10, -rad * 0.20,  rad * 0.20, -rad * 0.10],
      [ rad * 0.45,  rad * 0.10,  rad * 0.55, -rad * 0.05],
      [-rad * 0.05,  rad * 0.20,  rad * 0.05,  rad * 0.10]
    ];
    ctx.strokeStyle = 'rgba(40,28,12,0.35)';
    ctx.lineWidth = 1;
    for (var sc = 0; sc < scratches.length; sc++) {
      var s = scratches[sc];
      ctx.beginPath();
      ctx.moveTo(cx + s[0], cy + s[1]);
      ctx.lineTo(cx + s[2], cy + s[3]);
      ctx.stroke();
    }

    // -------- Colored zone scale arc (green / amber / red) --------
    // Painted as a thin band INSIDE the rim, leaving room for ticks.
    function drawZoneArc(from, to, color) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad - 4, Math.PI + Math.PI * from, Math.PI + Math.PI * to);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    // Dark neon backing — paints a black ring under the glow so the
    // tube reads as glass, not paint
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, rad - 4, Math.PI, 0);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#0a0604';
    ctx.stroke();
    ctx.restore();
    // Old-neon glow — soft, slightly hazy, dialed down so the brass
    // gauge still reads as the dominant material.
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(255,80,60,0.6)';
    drawZoneArc(0.00, 0.15, '#c83820');
    ctx.shadowColor = 'rgba(255,180,60,0.55)';
    drawZoneArc(0.15, 0.30, '#c88828');
    ctx.shadowColor = 'rgba(80,200,100,0.5)';
    drawZoneArc(0.30, 1.00, '#3a9050');
    ctx.restore();
    // Warm-tinted core line — hints at lit gas inside the tube without
    // going pure white.
    function drawZoneCore(from, to, color) {
      ctx.beginPath();
      ctx.arc(cx, cy, rad - 4, Math.PI + Math.PI * from, Math.PI + Math.PI * to);
      ctx.lineWidth = 1;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    drawZoneCore(0.00, 0.15, 'rgba(255,170,140,0.85)');
    drawZoneCore(0.15, 0.30, 'rgba(255,210,150,0.80)');
    drawZoneCore(0.30, 1.00, 'rgba(180,240,180,0.75)');
    // Hatched overlay on critical for extra emphasis
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rad - 2, Math.PI, Math.PI + Math.PI * 0.15);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,80,40,0.18)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(20,4,2,0.55)';
    ctx.lineWidth = 1;
    for (var hl = -bh; hl < bw + bh; hl += 3) {
      ctx.beginPath();
      ctx.moveTo(bx + hl, by);
      ctx.lineTo(bx + hl + bh, by + bh);
      ctx.stroke();
    }
    ctx.restore();

    // -------- Inner brass-rim line --------
    ctx.strokeStyle = '#b88c4a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rad - 0.5, Math.PI + 0.10, Math.PI + 0.75);
    ctx.stroke();
    ctx.strokeStyle = '#4f3a1b';
    ctx.beginPath();
    ctx.arc(cx, cy, rad - 0.5, -0.65, -0.10);
    ctx.stroke();

    // -------- Tick marks + numerals --------
    var maxFuelLocal = (typeof maxFuel === 'number' && maxFuel > 0) ? maxFuel : 30;
    var fuelFrac = (typeof player !== 'undefined' && player) ? Math.max(0, Math.min(1, player.fuel / maxFuelLocal)) : 0;
    ctx.strokeStyle = '#1f1408';
    for (var t = 0; t <= 4; t++) {
      var ang = Math.PI + Math.PI * (t / 4);
      ctx.lineWidth = (t === 0 || t === 4) ? 1.7 : 1.2;
      var x0 = cx + Math.cos(ang) * (rad - 7);
      var y0 = cy + Math.sin(ang) * (rad - 7);
      var x1 = cx + Math.cos(ang) * (rad - 11);
      var y1 = cy + Math.sin(ang) * (rad - 11);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      if (t < 4) {
        for (var st = 1; st <= 3; st++) {
          var sang = Math.PI + Math.PI * ((t + st / 4) / 4);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(sang) * (rad - 7), cy + Math.sin(sang) * (rad - 7));
          ctx.lineTo(cx + Math.cos(sang) * (rad - 9), cy + Math.sin(sang) * (rad - 9));
          ctx.stroke();
        }
      }
    }
    // E / F at the ends, scale-1 numerals (25 / 50 / 75) at the major ticks
    drawStencilText('E', cx + Math.cos(Math.PI) * (rad - 16) - 2, cy + Math.sin(Math.PI) * (rad - 16) - 3, 1, '#1f1408');
    drawStencilText('F', cx + Math.cos(0) * (rad - 16) - 2, cy + Math.sin(0) * (rad - 16) - 3, 1, '#1f1408');

    // -------- Needle with shadow + colored tip --------
    var needleAng = Math.PI + Math.PI * fuelFrac;
    var nLen = rad - 6;
    var nx = cx + Math.cos(needleAng) * nLen;
    var ny = cy + Math.sin(needleAng) * nLen;
    // Drop shadow
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + 1, cy + 1); ctx.lineTo(nx + 1, ny + 1); ctx.stroke();
    // Main needle
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
    // Red tip on the last 3 px (mirrors hull's critical-zone red)
    var tipStartFrac = Math.max(0, (nLen - 3) / nLen);
    var tipX0 = cx + Math.cos(needleAng) * (nLen - 3);
    var tipY0 = cy + Math.sin(needleAng) * (nLen - 3);
    ctx.strokeStyle = '#ff4030';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(tipX0, tipY0); ctx.lineTo(nx, ny); ctx.stroke();
    ctx.lineCap = 'butt';

    // -------- Hub (brass screw with slot) --------
    ctx.fillStyle = '#3a3833';
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#52504a';
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a7770';
    ctx.fillRect(cx - 2, cy - 2, 1, 1);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(cx - 2, cy, 4, 1);

    // -------- Pressure-relief screw at top --------
    drawHexBolt(cx, cy - rad + 4);

    // -------- Glass dome (two highlight arcs + bottom rim) --------
    ctx.strokeStyle = 'rgba(230,245,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rad - 1, Math.PI + 0.20, Math.PI + 0.65);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,245,255,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, rad - 4, Math.PI + 0.30, Math.PI + 0.55);
    ctx.stroke();
    // Bottom-rim glint (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.arc(cx, cy, rad - 1, -0.4, -0.15);
    ctx.stroke();

    // -------- "Fuel to climb home" marker --------
    // A little notch that slides along the gauge as depth changes — it
    // marks the fuel needed to fly back up to the surface (getFuelToSurface
    // bakes in a safety buffer). Keep the needle above it and you can make
    // it home; the notch turns red when you can't.
    var toSurface = getFuelToSurface();
    if (toSurface > 0.5) {
      var markFrac = Math.min(1, toSurface / maxFuelLocal);
      var mAng = Math.PI + Math.PI * markFrac;
      var mCos = Math.cos(mAng), mSin = Math.sin(mAng);
      var mCol = player.fuel >= toSurface ? '#bfe9ff' : '#ff5436';
      // Dark backing so the notch reads on any zone colour.
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0a0604';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx + mCos * (rad - 1.5), cy + mSin * (rad - 1.5));
      ctx.lineTo(cx + mCos * (rad - 10),  cy + mSin * (rad - 10));
      ctx.stroke();
      // Colored core.
      ctx.strokeStyle = mCol;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + mCos * (rad - 2.5), cy + mSin * (rad - 2.5));
      ctx.lineTo(cx + mCos * (rad - 9),   cy + mSin * (rad - 9));
      ctx.stroke();
      ctx.lineCap = 'butt';
      // Bead just outside the rim — the head of the marker.
      ctx.fillStyle = '#0a0604';
      ctx.beginPath();
      ctx.arc(cx + mCos * (rad + 1.5), cy + mSin * (rad + 1.5), 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mCol;
      ctx.beginPath();
      ctx.arc(cx + mCos * (rad + 1.5), cy + mSin * (rad + 1.5), 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // -------- Status lamp top-right --------
    var lampState = 'off';
    if (fuelFrac < 0.15)      lampState = 'critical';
    else if (fuelFrac < 0.30) lampState = 'caution';
    drawWarningLamp(bx + bw - 8, by + 12, lampState);
  }

  // §5.1b Speed readout — a lit numeric window (same brass-face + recessed
  // display construction as the CASH / DEPTH bays, so the three digital
  // readouts read as a family). Shows the rig's total speed (|velocity|) as a
  // big centred MPH number, converted exactly as the 'FELL n MPH' fall readout
  // does (32 px = 1 m, m/s → MPH), so the two always agree. The number is eased
  // toward the reading so it ticks instead of strobing, and it warms amber →
  // orange → red as you climb into fall-damage territory (the little corner
  // lamp echoes it).
  var speedoMphSmooth = 0;
  function drawSpeedDisplay(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'SPEED');
    drawBayBolts(bx, by, bw, bh);
    var pad = 5;
    var fx = bx + pad;
    var fy = by + pad + 6;
    var fw = bw - pad * 2;
    var fh = bh - pad * 2 - 6;

    // ---- Outer dark steel bezel ----
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = '#332820';
    ctx.fillRect(fx, fy, fw, 1);
    ctx.fillRect(fx, fy, 1, fh);
    ctx.fillStyle = '#000000';
    ctx.fillRect(fx, fy + fh - 1, fw, 1);
    ctx.fillRect(fx + fw - 1, fy, 1, fh);

    // ---- Bronze inset ring ----
    var bxi = fx + 2, byi = fy + 2, bwi = fw - 4, bhi = fh - 4;
    ctx.fillStyle = '#5a3e1c';
    ctx.fillRect(bxi, byi, bwi, bhi);
    ctx.fillStyle = '#8a6428';
    ctx.fillRect(bxi, byi, bwi, 1);
    ctx.fillStyle = '#3a2810';
    ctx.fillRect(bxi, byi + bhi - 1, bwi, 1);

    // ---- Brushed brass face ----
    var ax = bxi + 1, ay = byi + 1, aw = bwi - 2, ah = bhi - 2;
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(ax, ay, aw, ah);
    for (var sx = ax + 1; sx < ax + aw - 1; sx += 3) {
      ctx.fillStyle = 'rgba(160,124,64,0.18)';
      ctx.fillRect(sx, ay + 1, 1, ah - 2);
    }
    for (var sx2 = ax + 2; sx2 < ax + aw - 1; sx2 += 5) {
      ctx.fillStyle = 'rgba(48,32,12,0.22)';
      ctx.fillRect(sx2, ay + 1, 1, ah - 2);
    }
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(ax, ay, aw, 1);
    ctx.fillRect(ax, ay, 1, ah);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(ax, ay + ah - 1, aw, 1);
    ctx.fillRect(ax + aw - 1, ay, 1, ah);

    // Corner screws on the brass plate
    function speedScrew(cx, cy) {
      ctx.fillStyle = '#1a1006';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      ctx.fillStyle = '#9c7a40';
      ctx.fillRect(cx, cy, 1, 1);
    }
    speedScrew(ax + 2, ay + 2);
    speedScrew(ax + aw - 3, ay + 2);

    // ---- Live value: |velocity| px/s → MPH (same conversion as 'FELL n MPH') ----
    var spd = (typeof player !== 'undefined' && player)
      ? Math.sqrt(player.vx * player.vx + player.vy * player.vy) : 0;
    var mphNow = spd / 32 * 2.237;
    speedoMphSmooth += (mphNow - speedoMphSmooth) * 0.18;
    if (speedoMphSmooth < 0.05) speedoMphSmooth = 0;
    var spdMax = (typeof SPEEDO_MPH_MAX === 'number' && SPEEDO_MPH_MAX > 0) ? SPEEDO_MPH_MAX : 80;
    var spdFrac = Math.max(0, Math.min(1, speedoMphSmooth / spdMax));

    // ---- Recessed display window ----
    var hasStencil = ah >= 40;
    var winX = ax + 4;
    var winY = ay + 6;
    var winW = aw - 8;
    var winH = ah - 6 - (hasStencil ? 11 : 4);
    ctx.fillStyle = '#0e0a04';
    ctx.fillRect(winX, winY, winW, winH);
    ctx.fillStyle = '#000000';
    ctx.fillRect(winX, winY, winW, 1);
    ctx.fillRect(winX, winY, 1, winH);
    ctx.fillStyle = '#241808';
    ctx.fillRect(winX, winY + winH - 1, winW, 1);
    ctx.fillRect(winX + winW - 1, winY, 1, winH);

    // ---- MPH number — big, centred, warms with speed ----
    // Amber is the readout colour (matches DEPTH's #d4a838); gold #ffd24a is
    // reserved for money, so it is deliberately not used here. The number shifts
    // to orange then red as speed enters fall-damage territory.
    var numCol = '#d4a838';
    if (spdFrac >= 0.82)      numCol = '#ff5436';
    else if (spdFrac >= 0.60) numCol = '#f0902a';
    var mphStr = '' + Math.round(speedoMphSmooth);
    // Largest stencil scale (3 → 2 → 1) that fits the window in both axes.
    var scale = 3;
    if (stencilTextWidth(mphStr, scale) > winW - 8 || 7 * scale > winH - 4) scale = 2;
    if (stencilTextWidth(mphStr, scale) > winW - 8 || 7 * scale > winH - 4) scale = 1;
    var tw = stencilTextWidth(mphStr, scale);
    var tx = winX + Math.floor((winW - tw) / 2);
    if (tx < winX + 3) tx = winX + 3;
    var ty = winY + Math.floor((winH - 7 * scale) / 2);
    drawStencilText(mphStr, tx, ty, scale, numCol);

    // Glass sheen across the top of the window
    ctx.fillStyle = 'rgba(220,235,255,0.14)';
    ctx.fillRect(winX + 1, winY + 1, winW - 2, 1);

    // ---- Bottom stencil label ----
    if (hasStencil) {
      var stencil = 'MPH';
      var stW = stencilTextWidth(stencil, 1);
      if (stW <= aw - 4) {
        drawStencilText(stencil, ax + Math.floor((aw - stW) / 2), ay + ah - 9, 1, '#3a2810');
      }
    }

    // ---- Tiny status lamp (upper-right) — green, warming to red at redline ----
    var lampX = ax + aw - 6;
    var lampY = ay + 4;
    var lampCol = '#40c060', lampHi = 'rgba(180,255,200,0.55)';
    if (spdFrac >= 0.82)      { lampCol = '#ff5436'; lampHi = 'rgba(255,200,180,0.6)'; }
    else if (spdFrac >= 0.60) { lampCol = '#f0a02a'; lampHi = 'rgba(255,225,170,0.55)'; }
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(lampX - 1, lampY - 1, 4, 4);
    ctx.fillStyle = lampCol;
    ctx.fillRect(lampX, lampY, 2, 2);
    ctx.fillStyle = lampHi;
    ctx.fillRect(lampX, lampY, 1, 1);
  }

  // §5.2 Plate counter — positional health zones (UI_STYLE.md §5.2 +
  // §6 amendment). 8 armor plates colored green/amber/red by POSITION,
  // not by current hull value. Damage takes plates from the right;
  // a full hull shows the whole gradient, a critical hull shows only
  // the green plates left. The color zones themselves communicate
  // remaining margin; no master warning lamp needed.
  function drawHullPlates(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'HULL');
    drawBayBolts(bx, by, bw, bh);
    var n = 8;
    var pw = 8;
    var pgap = 1;
    var rowW = n * pw + (n - 1) * pgap;
    var x0 = bx + (bw - rowW) / 2;
    var ph = Math.min(bh - 22, 40);
    var y0 = by + (bh - ph) / 2 + 3;
    var maxHullLocal = (typeof getMaxHull === 'function') ? getMaxHull() : 100;
    var hullFrac = (typeof player !== 'undefined' && player) ? Math.max(0, Math.min(1, player.hull / maxHullLocal)) : 0;
    var intactPlates = Math.ceil(hullFrac * n);

    // Per-plate position zones: green (left), amber (middle), red (right)
    var nRed    = Math.max(1, Math.round(n * 0.15));   // 1
    var nAmber  = Math.max(1, Math.round(n * 0.25));   // 2
    var nGreen  = n - nRed - nAmber;                   // 5
    function plateZoneColors(idx) {
      // idx is 0-based plate position
      if (idx < nGreen) {
        return { base: '#40c060', hi: '#7be098', sh: '#268040' };
      } else if (idx < nGreen + nAmber) {
        return { base: '#e0a020', hi: '#ffd47a', sh: '#9c6010' };
      } else {
        return { base: '#e83a26', hi: '#ff7060', sh: '#7a2418' };
      }
    }

    // Recessed metal backing strip (destroyed plates show this)
    ctx.fillStyle = '#0e0c0a';
    ctx.fillRect(x0 - 3, y0 - 2, rowW + 6, ph + 4);
    ctx.fillStyle = '#1a1612';
    ctx.fillRect(x0 - 3, y0 - 2, rowW + 6, 1);
    ctx.fillRect(x0 - 3, y0 - 2, 1, ph + 4);
    ctx.fillStyle = '#2a2520';
    ctx.fillRect(x0 - 3, y0 + ph + 1, rowW + 6, 1);
    ctx.fillRect(x0 + rowW + 2, y0 - 2, 1, ph + 4);

    for (var i = 0; i < n; i++) {
      var px = x0 + i * (pw + pgap);
      var stage;
      if (i < intactPlates - 1) stage = 0;
      else if (i === intactPlates - 1) {
        var subFrac = (hullFrac * n) - (intactPlates - 1);
        if (subFrac > 0.66)      stage = 0;
        else if (subFrac > 0.33) stage = 1;
        else                     stage = 2;
      } else stage = 3;
      if (stage === 3) continue;

      var z = plateZoneColors(i);

      // Plate body in zone color
      ctx.fillStyle = z.base;
      ctx.fillRect(px, y0, pw, ph);
      // Top + left highlight
      ctx.fillStyle = z.hi;
      ctx.fillRect(px, y0, pw, 1);
      ctx.fillRect(px, y0, 1, ph);
      // Bottom + right shadow
      ctx.fillStyle = z.sh;
      ctx.fillRect(px, y0 + ph - 1, pw, 1);
      ctx.fillRect(px + pw - 1, y0, 1, ph);
      // 4-corner rivets (always dark for industrial read regardless of zone)
      ctx.fillStyle = UI_OUTLINE;
      ctx.fillRect(px + 1, y0 + 1, 1, 1);
      ctx.fillRect(px + pw - 2, y0 + 1, 1, 1);
      ctx.fillRect(px + 1, y0 + ph - 2, 1, 1);
      ctx.fillRect(px + pw - 2, y0 + ph - 2, 1, 1);
      ctx.fillStyle = z.sh;
      ctx.fillRect(px + 2, y0 + 2, 1, 1);
      ctx.fillRect(px + pw - 3, y0 + 2, 1, 1);
      // Centre groove
      ctx.fillStyle = z.sh;
      ctx.fillRect(px + Math.floor(pw / 2), y0 + 3, 1, ph - 6);

      // Damage overlays — black cracks regardless of zone
      if (stage >= 1) {
        ctx.fillStyle = UI_OUTLINE;
        for (var c = 0; c < 5; c++) {
          ctx.fillRect(px + 1 + c, y0 + 5 + c, 1, 1);
        }
      }
      if (stage >= 2) {
        ctx.fillStyle = UI_OUTLINE;
        for (var c2 = 0; c2 < 6; c2++) {
          ctx.fillRect(px + 4 - Math.floor(c2 / 2), y0 + 12 + c2, 1, 1);
        }
        ctx.fillRect(px + 2, y0 + ph - 8, 3, 1);
        ctx.fillRect(px + 2, y0 + ph - 7, 1, 2);
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(px + pw - 3, y0 + ph - 5, 1, 1);
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
    drawBayBolts(bx, by, bw, bh);
    var pad = 3;
    var fx = bx + pad;
    var fy = by + pad + 6;
    var fw = bw - pad * 2;
    var fh = bh - pad * 2 - 6;

    // Brass frame
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(fx, fy, fw, 1);
    ctx.fillRect(fx, fy, 1, fh);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(fx, fy + fh - 1, fw, 1);
    ctx.fillRect(fx + fw - 1, fy, 1, fh);

    // Inner dark interior
    var ix = fx + 3;
    var iy = fy + 3;
    var iw = fw - 6;
    var ih = fh - 6;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(ix, iy + ih - 1, iw, 1);
    ctx.fillRect(ix + iw - 1, iy, 1, ih);

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

    // Render slots. Fill ORDER: bottom-up, left-to-right. So cargo[0]
    // sits in the bottom-left cell, cargo[1] right of it, etc.
    var hoverOre = null, hoverCx = 0, hoverCellW = 0;
    for (var k = 0; k < maxC; k++) {
      var rowFromBottom = Math.floor(k / cols);
      var colInRow = k % cols;
      var cx = ix + gap + colInRow * (cellW + gap);
      var cy = iy + ih - gap - cellH - rowFromBottom * (cellH + gap);
      // Slot recess (always drawn so empties read as "this is a slot")
      ctx.fillStyle = '#050505';
      ctx.fillRect(cx, cy, cellW, cellH);
      // 1-px inset shadow on top + left
      ctx.fillStyle = '#000000';
      ctx.fillRect(cx, cy, cellW, 1);
      ctx.fillRect(cx, cy, 1, cellH);
      // 1-px inset highlight on bottom + right (recessed)
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(cx, cy + cellH - 1, cellW, 1);
      ctx.fillRect(cx + cellW - 1, cy, 1, cellH);

      if (k < cargoArr.length) {
        var cu = cargoArr[k];
        var ore = (typeof ORES !== 'undefined' && ORES[cargoType(cu)]) ? ORES[cargoType(cu)] : null;
        var oreShiny = cargoShiny(cu);
        var col = ore ? ore.color : '#888';
        // Pointer hover — remember the ore the cursor is over (desktop).
        if (ore && typeof mouseCursor !== 'undefined' &&
            mouseCursor.x >= cx && mouseCursor.x < cx + cellW &&
            mouseCursor.y >= cy && mouseCursor.y < cy + cellH) {
          hoverOre = ore; hoverCx = cx; hoverCellW = cellW;
        }
        // Ore body (inset 1 px from slot edges)
        ctx.fillStyle = col;
        ctx.fillRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
        // Highlight + shadow for material read
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(cx + 1, cy + 1, cellW - 2, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.30)';
        ctx.fillRect(cx + 1, cy + cellH - 2, cellW - 2, 1);
        if (oreShiny) {
          // shiny unit in the hold: warm-gold corner pip + bright top/left rim
          ctx.fillStyle = '#fff1b0';
          ctx.fillRect(cx + cellW - 4, cy + 1, 3, 3);
          ctx.fillStyle = 'rgba(255,240,170,0.85)';
          ctx.fillRect(cx + 1, cy + 1, cellW - 2, 1);
          ctx.fillRect(cx + 1, cy + 1, 1, cellH - 2);
        }
      }
    }

    // Glass cover highlight (1-px at top of chamber)
    ctx.fillStyle = 'rgba(220,235,255,0.18)';
    ctx.fillRect(ix + 1, iy + 1, iw - 2, 1);

    // Hover tooltip — names the ore under the cursor. Drawn above the
    // bay so it never overlaps the slots; brass-framed to match.
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
      ctx.fillStyle = '#a07c40';
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
      ctx.fillStyle = '#b89a6a';
      ctx.fillText(tipSub, tipX + tipPad, tipY + 24);
      ctx.restore();
    }
  }

  // §5.4 Dial wheel — proper rotating-drum treatment. Four digit drums
  // each in their own brass slot, with peeks of the adjacent digits
  // ghosted at top/bottom for the cylindrical-wheel illusion. Trailing
  // "M" suffix in stencil gold.
  function drawDepthDisplay(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'DEPTH');
    drawBayBolts(bx, by, bw, bh);
    var pad = 5;
    var fx = bx + pad;
    var fy = by + pad + 6;
    var fw = bw - pad * 2;
    var fh = bh - pad * 2 - 6;

    // ---- Outer dark steel bezel ----
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = '#332820';
    ctx.fillRect(fx, fy, fw, 1);
    ctx.fillRect(fx, fy, 1, fh);
    ctx.fillStyle = '#000000';
    ctx.fillRect(fx, fy + fh - 1, fw, 1);
    ctx.fillRect(fx + fw - 1, fy, 1, fh);

    // ---- Bronze inset ring ----
    var bxi = fx + 2, byi = fy + 2, bwi = fw - 4, bhi = fh - 4;
    ctx.fillStyle = '#5a3e1c';
    ctx.fillRect(bxi, byi, bwi, bhi);
    ctx.fillStyle = '#8a6428';
    ctx.fillRect(bxi, byi, bwi, 1);
    ctx.fillStyle = '#3a2810';
    ctx.fillRect(bxi, byi + bhi - 1, bwi, 1);

    // ---- Brushed brass face ----
    var ax = bxi + 1, ay = byi + 1, aw = bwi - 2, ah = bhi - 2;
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(ax, ay, aw, ah);
    // Vertical brushed-metal scan lines (subtle)
    for (var sx = ax + 1; sx < ax + aw - 1; sx += 3) {
      ctx.fillStyle = 'rgba(160,124,64,0.18)';
      ctx.fillRect(sx, ay + 1, 1, ah - 2);
    }
    for (var sx2 = ax + 2; sx2 < ax + aw - 1; sx2 += 5) {
      ctx.fillStyle = 'rgba(48,32,12,0.22)';
      ctx.fillRect(sx2, ay + 1, 1, ah - 2);
    }
    // Face rim highlight + shadow
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(ax, ay, aw, 1);
    ctx.fillRect(ax, ay, 1, ah);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(ax, ay + ah - 1, aw, 1);
    ctx.fillRect(ax + aw - 1, ay, 1, ah);

    // Corner screws on the brass plate
    function depthScrew(cx, cy) {
      ctx.fillStyle = '#1a1006';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      ctx.fillStyle = '#9c7a40';
      ctx.fillRect(cx, cy, 1, 1);
    }
    depthScrew(ax + 2, ay + 2);
    depthScrew(ax + aw - 3, ay + 2);

    // Depth metres
    var depthM = 0;
    if (typeof player !== 'undefined' && player && typeof SKY_ROWS === 'number') {
      depthM = Math.max(0, ((player.y - SKY_ROWS * TILE) / TILE) | 0);
    }
    var sDepth = depthM.toFixed(0);
    while (sDepth.length < 4) sDepth = '0' + sDepth;

    // Drum slot geometry
    var scale = 2;
    var digitW = 5 * scale;
    var drumW = digitW + 4;
    var drumGap = 1;
    var nDigits = 4;
    var totalDrums = drumW * nDigits + drumGap * (nDigits - 1);
    // Suffix "M" is rendered at scale 1 below the drums, not inline,
    // so reserve no horizontal room for it here. This lets the drums
    // center cleanly in the brass face.
    var totalW = totalDrums;
    var drumStartX = ax + Math.floor((aw - totalW) / 2);
    var drumH = 7 * scale + 6;
    // Lift drums up a touch to leave room for manufacturer stencil at bottom
    var drumY = ay + Math.floor((ah - drumH) / 2) - 2;

    // Chrome cluster bezel around the whole drum row
    var clX = drumStartX - 3;
    var clY = drumY - 2;
    var clW = totalDrums + 6;
    var clH = drumH + 4;
    ctx.fillStyle = '#0a0604';
    ctx.fillRect(clX, clY, clW, clH);
    ctx.fillStyle = '#3a2e1c';
    ctx.fillRect(clX, clY, clW, 1);
    ctx.fillRect(clX, clY, 1, clH);
    ctx.fillStyle = '#000000';
    ctx.fillRect(clX, clY + clH - 1, clW, 1);
    ctx.fillRect(clX + clW - 1, clY, 1, clH);

    // Per-digit drum
    for (var d = 0; d < nDigits; d++) {
      var dx = drumStartX + d * (drumW + drumGap);
      // Dark recessed slot
      ctx.fillStyle = '#0e0a04';
      ctx.fillRect(dx, drumY, drumW, drumH);
      // Inner shadow (top + left)
      ctx.fillStyle = '#000000';
      ctx.fillRect(dx, drumY, drumW, 1);
      ctx.fillRect(dx, drumY, 1, drumH);
      // Inner highlight (bottom + right) — sells the recess
      ctx.fillStyle = '#241808';
      ctx.fillRect(dx, drumY + drumH - 1, drumW, 1);
      ctx.fillRect(dx + drumW - 1, drumY, 1, drumH);

      var ch = sDepth.charAt(d);
      var digit = parseInt(ch, 10);
      // Centre digit
      var cdx = dx + Math.floor((drumW - digitW) / 2);
      var cdy = drumY + Math.floor((drumH - 7 * scale) / 2);
      drawStencilText(ch, cdx, cdy, scale, '#d4a838');

      // Peek of digit above (dim) — shows last row at top of slot
      var above = String((digit + 9) % 10);
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx + 1, drumY + 1, drumW - 2, 3);
      ctx.clip();
      drawStencilText(above, cdx, cdy - 7 * scale - 2, scale, 'rgba(212, 168, 56, 0.32)');
      ctx.restore();

      // Peek of digit below (dim) — shows first row at bottom of slot
      var below = String((digit + 1) % 10);
      ctx.save();
      ctx.beginPath();
      ctx.rect(dx + 1, drumY + drumH - 4, drumW - 2, 3);
      ctx.clip();
      drawStencilText(below, cdx, cdy + 7 * scale + 2, scale, 'rgba(212, 168, 56, 0.32)');
      ctx.restore();

      // Glass sheen — diagonal-ish highlight: top band + bright-left strip
      ctx.fillStyle = 'rgba(220,235,255,0.22)';
      ctx.fillRect(dx + 1, drumY + 1, drumW - 2, 1);
      ctx.fillStyle = 'rgba(220,235,255,0.10)';
      ctx.fillRect(dx + 1, drumY + 2, 1, drumH - 3);
      // Bottom rim glint
      ctx.fillStyle = 'rgba(255,210,120,0.10)';
      ctx.fillRect(dx + 1, drumY + drumH - 2, drumW - 2, 1);
    }

    // Thousands separator rim (like an odometer)
    var sepX = drumStartX + drumW * 2 + drumGap;
    ctx.fillStyle = '#c89048';
    ctx.fillRect(sepX - 1, drumY - 1, 1, drumH + 2);

    // Bottom row: "METRES · TYPE-D" stencil at scale 1, centered.
    var stencil = 'METRES · TYPE-D';
    var stWidth = stencilTextWidth(stencil, 1);
    if (stWidth > aw - 4) {
      stencil = 'METRES';
      stWidth = stencilTextWidth(stencil, 1);
    }
    var stX = ax + Math.floor((aw - stWidth) / 2);
    var stY = ay + ah - 9;
    drawStencilText(stencil, stX, stY, 1, '#3a2810');

    // Tiny status lamp (powered) at upper-right of brass face
    var lampX = ax + aw - 6;
    var lampY = ay + 4;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(lampX - 1, lampY - 1, 4, 4);
    ctx.fillStyle = '#40c060';
    ctx.fillRect(lampX, lampY, 2, 2);
    ctx.fillStyle = 'rgba(180,255,200,0.55)';
    ctx.fillRect(lampX, lampY, 1, 1);
  }

  // §4.3/§6 SAVE annunciator (the 'sys' bay, v24.126). A single status lamp
  // in a recessed steel housing: dark when idle (silence is OK, §10.7),
  // steady info-blue for ~3 s after each successful save write, hard 1 Hz
  // caution blink while writes are failing. State lives in 047-save.js
  // (saveLampT / saveLampFailT, decayed in saveTick).
  function drawSysAnnunciator(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'SAVE');
    drawBayBolts(bx, by, bw, bh);
    var cx = bx + (bw >> 1);
    var cy = by + (bh >> 1) + 4;   // optical centre, below the label line
    // Recessed dark steel housing (matches the other instruments' bezels).
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(cx - 6, cy - 6, 12, 12);
    ctx.fillStyle = '#000000';
    ctx.fillRect(cx - 6, cy - 6, 12, 1);
    ctx.fillRect(cx - 6, cy - 6, 1, 12);
    ctx.fillStyle = '#332820';
    ctx.fillRect(cx - 6, cy + 5, 12, 1);
    ctx.fillRect(cx + 5, cy - 6, 1, 12);
    var lit = false, core, halo, spec;
    if (saveLampFailT > 0) {
      // Caution: hard 0/1 blink at 1 Hz per §4.3, no fade.
      lit = (saveLampFailT % 1) < 0.5;
      core = '#ffb030'; halo = '#b06010'; spec = '#ffe0a0';
    } else if (saveLampT > 0) {
      // Info: steady while lit, short fade tail at the very end.
      lit = true;
      core = '#4080ff'; halo = '#1c3a80'; spec = '#cfe0ff';
    }
    if (lit) {
      ctx.save();
      ctx.globalAlpha = (saveLampFailT > 0) ? 1 : Math.min(1, saveLampT / 0.5);
      ctx.fillStyle = halo;
      ctx.fillRect(cx - 3, cy - 3, 7, 7);   // 1-px halo ring
      ctx.fillStyle = core;
      ctx.fillRect(cx - 2, cy - 2, 5, 5);   // lamp dome
      ctx.fillStyle = spec;
      ctx.fillRect(cx - 1, cy - 1, 1, 1);   // specular point
      ctx.restore();
    } else {
      ctx.fillStyle = '#2a2a2a';            // unlit halo (§4.3)
      ctx.fillRect(cx - 3, cy - 3, 7, 7);
      ctx.fillStyle = '#1a1a1a';            // unlit core
      ctx.fillRect(cx - 2, cy - 2, 5, 5);
    }
  }

  // §5.5 Cash readout — brass-faced instrument with a recessed dark
  // display window. The player's balance is shown right-aligned in gold
  // stencil; the type size drops a notch once the number gets long so
  // late-game six-figure totals never clip the window.
  function drawCashDisplay(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'CASH');
    drawBayBolts(bx, by, bw, bh);
    var pad = 5;
    var fx = bx + pad;
    var fy = by + pad + 6;
    var fw = bw - pad * 2;
    var fh = bh - pad * 2 - 6;

    // ---- Outer dark steel bezel ----
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = '#332820';
    ctx.fillRect(fx, fy, fw, 1);
    ctx.fillRect(fx, fy, 1, fh);
    ctx.fillStyle = '#000000';
    ctx.fillRect(fx, fy + fh - 1, fw, 1);
    ctx.fillRect(fx + fw - 1, fy, 1, fh);

    // ---- Bronze inset ring ----
    var bxi = fx + 2, byi = fy + 2, bwi = fw - 4, bhi = fh - 4;
    ctx.fillStyle = '#5a3e1c';
    ctx.fillRect(bxi, byi, bwi, bhi);
    ctx.fillStyle = '#8a6428';
    ctx.fillRect(bxi, byi, bwi, 1);
    ctx.fillStyle = '#3a2810';
    ctx.fillRect(bxi, byi + bhi - 1, bwi, 1);

    // ---- Brushed brass face ----
    var ax = bxi + 1, ay = byi + 1, aw = bwi - 2, ah = bhi - 2;
    ctx.fillStyle = '#7a5a2c';
    ctx.fillRect(ax, ay, aw, ah);
    for (var sx = ax + 1; sx < ax + aw - 1; sx += 3) {
      ctx.fillStyle = 'rgba(160,124,64,0.18)';
      ctx.fillRect(sx, ay + 1, 1, ah - 2);
    }
    for (var sx2 = ax + 2; sx2 < ax + aw - 1; sx2 += 5) {
      ctx.fillStyle = 'rgba(48,32,12,0.22)';
      ctx.fillRect(sx2, ay + 1, 1, ah - 2);
    }
    ctx.fillStyle = '#a07c40';
    ctx.fillRect(ax, ay, aw, 1);
    ctx.fillRect(ax, ay, 1, ah);
    ctx.fillStyle = '#4f3a1b';
    ctx.fillRect(ax, ay + ah - 1, aw, 1);
    ctx.fillRect(ax + aw - 1, ay, 1, ah);

    // Corner screws on the brass plate
    function cashScrew(cx, cy) {
      ctx.fillStyle = '#1a1006';
      ctx.fillRect(cx - 1, cy - 1, 3, 3);
      ctx.fillStyle = '#9c7a40';
      ctx.fillRect(cx, cy, 1, 1);
    }
    cashScrew(ax + 2, ay + 2);
    cashScrew(ax + aw - 3, ay + 2);

    // ---- Recessed display window ----
    // A bottom strip is reserved for the "BALANCE" stencil only when the
    // brass face is tall enough; the short mobile-landscape console drops
    // the stencil and lets the window use the extra height.
    var hasStencil = ah >= 40;
    var winX = ax + 4;
    var winY = ay + 6;
    var winW = aw - 8;
    var winH = ah - 6 - (hasStencil ? 11 : 4);
    ctx.fillStyle = '#0e0a04';
    ctx.fillRect(winX, winY, winW, winH);
    ctx.fillStyle = '#000000';
    ctx.fillRect(winX, winY, winW, 1);
    ctx.fillRect(winX, winY, 1, winH);
    ctx.fillStyle = '#241808';
    ctx.fillRect(winX, winY + winH - 1, winW, 1);
    ctx.fillRect(winX + winW - 1, winY, 1, winH);

    // Per-card highlight wash: each payout beat lights the recessed window gold so
    // the counter visibly reacts as every card lands. cashPunch is set per beat
    // (graded by ore tier) in srFireBeat and decays in update(); the number flash
    // + a gold rim pulse follow below.
    var punch = (typeof cashPunch === 'number' && cashPunch > 0) ? Math.min(1, cashPunch) : 0;
    if (punch > 0.01) {
      ctx.fillStyle = 'rgba(255,226,122,' + (0.32 * punch).toFixed(3) + ')';
      ctx.fillRect(winX, winY, winW, winH);
    }

    // ---- Balance value — right-aligned gold stencil ----
    // Shows displayMoney (the eased odometer), not money, so a dock sale counts
    // up beat-by-beat instead of snapping. displayMoney tracks money 1:1 the
    // rest of the time; fall back to money if the lever isn't in scope yet.
    var bankShown = (typeof displayMoney === 'number' && isFinite(displayMoney)) ? displayMoney : money;
    var cashAmt = (typeof bankShown === 'number' && isFinite(bankShown)) ? Math.floor(bankShown) : 0;
    var cashStr = '$' + cashAmt.toLocaleString();
    // Largest stencil scale that fits the window; drops to 1 for long
    // numbers so the readout never clips.
    var scale = stencilTextWidth(cashStr, 2) <= winW - 8 ? 2 : 1;
    var tw = stencilTextWidth(cashStr, scale);
    var tx = winX + winW - 4 - tw;
    if (tx < winX + 3) tx = winX + 3;
    var ty = winY + Math.floor((winH - 7 * scale) / 2);
    drawStencilText(cashStr, tx, ty, scale, '#ffd24a');
    // Per-card highlight: each payout beat flashes the readout warm-white over
    // the gold, then a gold rim pulse frames the window (cashPunch is set per
    // beat in srFireBeat, graded by tier, and decays in update()). The finale
    // beat lands at full strength.
    if (punch > 0.01) {
      ctx.globalAlpha = punch;
      drawStencilText(cashStr, tx, ty, scale, '#fff4d0');
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(255,210,74,' + (0.60 * punch).toFixed(3) + ')';
      ctx.fillRect(winX, winY, winW, 1);
      ctx.fillRect(winX, winY + winH - 1, winW, 1);
      ctx.fillRect(winX, winY, 1, winH);
      ctx.fillRect(winX + winW - 1, winY, 1, winH);
    }

    // Glass sheen across the top of the window
    ctx.fillStyle = 'rgba(220,235,255,0.14)';
    ctx.fillRect(winX + 1, winY + 1, winW - 2, 1);

    // ---- Bottom stencil label ----
    if (hasStencil) {
      var stencil = 'BALANCE';
      var stW = stencilTextWidth(stencil, 1);
      if (stW <= aw - 4) {
        drawStencilText(stencil, ax + Math.floor((aw - stW) / 2), ay + ah - 9, 1, '#3a2810');
      }
    }

    // Tiny status lamp (powered) at upper-right of brass face
    var lampX = ax + aw - 6;
    var lampY = ay + 4;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(lampX - 1, lampY - 1, 4, 4);
    ctx.fillStyle = '#40c060';
    ctx.fillRect(lampX, lampY, 2, 2);
    ctx.fillStyle = 'rgba(180,255,200,0.55)';
    ctx.fillRect(lampX, lampY, 1, 1);

    // The dock-sale reveal (placards + chips + telegraph) renders here, hung off
    // the CASH bay since it is the balance window's moment. It paints in its own
    // full-screen CSS-pixel transform, isolated from the console's scaled space
    // by the save/restore inside drawSellReveal.
    drawSellReveal();
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
    ctx.fillStyle = '#1a1410'; ctx.fillRect(hx, hy, hw, hh);
    ctx.fillStyle = '#332820'; ctx.fillRect(hx, hy, hw, 1); ctx.fillRect(hx, hy, 1, hh);
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

  // §5.6 Reserve-fuel rack — deliberately NOT a gauge. Four jerry-can
  // pips in a dark steel recess: each lights amber when a spare tank is
  // aboard and reads as an empty socket when it isn't. Distinct at a
  // glance from the brass needle fuel gauge in the neighbouring bay.
  function drawReserveFuel(bx, by, bw, bh) {
    drawBayLabel(bx, by, bw, 'RESERVE');
    drawBayBolts(bx, by, bw, bh);
    var pad = 4;
    var fx = bx + pad;
    var fy = by + pad + 6;
    var fw = bw - pad * 2;
    var fh = bh - pad * 2 - 6;

    // Dark steel recess — the matte backdrop sets the canisters apart
    // from the brass instruments around it.
    ctx.fillStyle = '#15110b';
    ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = '#000000';
    ctx.fillRect(fx, fy, fw, 1);
    ctx.fillRect(fx, fy, 1, fh);
    ctx.fillStyle = '#2f2718';
    ctx.fillRect(fx, fy + fh - 1, fw, 1);
    ctx.fillRect(fx + fw - 1, fy, 1, fh);

    var have = (typeof reserveFuel === 'number') ? reserveFuel : 0;
    var n = RESERVE_FUEL_MAX;
    var gap = 3;
    var slotW = Math.floor((fw - gap * (n + 1)) / n);
    var slotH = fh - gap * 2;
    var usedW = slotW * n + gap * (n + 1);
    var startX = fx + Math.floor((fw - usedW) / 2) + gap;
    var slotY = fy + gap;
    for (var i = 0; i < n; i++) {
      drawFuelCanister(startX + i * (slotW + gap), slotY, slotW, slotH, i < have);
    }
  }

  // One reserve-tank pip for drawReserveFuel(): a little jerry can, lit
  // amber when stocked, a dim empty socket when not.
  function drawFuelCanister(x, y, w, h, filled) {
    x = Math.round(x); y = Math.round(y);
    w = Math.round(w); h = Math.round(h);
    var capW = Math.max(3, Math.round(w * 0.42));
    var capH = Math.max(2, Math.round(h * 0.13));
    var capX = x + Math.round((w - capW) / 2);
    var bodyY = y + capH;
    var bodyH = h - capH;

    if (!filled) {
      // Empty socket — recessed dark slot with a faint canister ghost.
      ctx.fillStyle = '#0a0805';
      ctx.fillRect(x, bodyY, w, bodyH);
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, bodyY, w, 1);
      ctx.fillRect(x, bodyY, 1, bodyH);
      ctx.fillStyle = '#241d12';
      ctx.fillRect(x, bodyY + bodyH - 1, w, 1);
      ctx.fillRect(x + w - 1, bodyY, 1, bodyH);
      ctx.fillRect(capX, y, capW, capH);
      ctx.fillStyle = '#0a0805';
      ctx.fillRect(capX + 1, y + 1, capW - 2, Math.max(1, capH - 1));
      return;
    }

    // Filled — amber jerry can.
    ctx.fillStyle = '#6f4d16';                       // cap nub
    ctx.fillRect(capX, y, capW, capH);
    ctx.fillStyle = '#a87c22';
    ctx.fillRect(capX, y, capW, 1);
    ctx.fillStyle = '#e0a838';                       // body
    ctx.fillRect(x, bodyY, w, bodyH);
    ctx.fillStyle = '#ffd35c';                       // top + left highlight
    ctx.fillRect(x, bodyY, w, 1);
    ctx.fillRect(x, bodyY, 1, bodyH);
    ctx.fillStyle = '#9c6d1c';                       // bottom + right shade
    ctx.fillRect(x, bodyY + bodyH - 1, w, 1);
    ctx.fillRect(x + w - 1, bodyY, 1, bodyH);
    // Pressed jerry-can brace lines
    ctx.fillStyle = 'rgba(60,40,8,0.55)';
    ctx.fillRect(x + 1, bodyY + Math.round(bodyH * 0.34), w - 2, 1);
    ctx.fillRect(x + 1, bodyY + Math.round(bodyH * 0.66), w - 2, 1);
    // Glint
    ctx.fillStyle = 'rgba(255,244,200,0.7)';
    ctx.fillRect(x + 2, bodyY + 2, 1, Math.max(1, Math.round(bodyH * 0.28)));
  }

