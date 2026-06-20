  // ====== GREAT SEAM + MINERAL LEDGER ======
  // The game's "proper end that doesn't end the game": a one-time legendary
  // find (the Great Seam, ЖИЛА) carved into the deepest town's floor by
  // carveGreatSeamChamber() (030), plus the Mineral Ledger, a full-screen
  // collection catalogue of every minable ore.
  //
  // API the rest of the game calls (all plain IIFE-scope functions):
  //   seamExtract(r, c)          -> drill code calls this when the player
  //                                 drills a 'greatseam' tile. First call arms
  //                                 a 2.5s crescendo; the award + credits
  //                                 plate fire from the render dispatch.
  //   seamCreditsActive()        -> true while the EXPEDITION COMPLETE plate
  //                                 is up (input code may want to swallow
  //                                 movement taps).
  //   seamCreditsDismiss()       -> close the plate (also self-handled by the
  //                                 listeners below; any tap/click/key).
  //   ledgerRecordOre(type, shiny) -> call at ore-collect time.
  //   ledgerToggle()             -> open/close the ledger page (ledgerOpen).
  //   drawSeamFx() / drawLedger() -> dispatched from the RENDER: UI overlay
  //                                 section in 140; both self-gate.
  //
  // Persistence: ledgerData + seamComplete ride in the save profile
  // (047-save.js, additive fields with safe defaults for old saves).

  // ----- Tunables -----
  var SEAM_EXTRACT_S = 2.5;        // crescendo length before the award lands
  var SEAM_REWARD = 25000;         // dollars for securing the core sample
  var SEAM_PLATE_PRE_S = 0.35;     // beat of gold dim before the plate drops
  var SEAM_PLATE_SLIDE_S = 0.45;   // plate descent time
  var SEAM_PLATE_BOUNCE_S = 0.55;  // damped landing bounce
  var SEAM_DISMISS_MIN_S = 0.9;    // plate must be visible this long before a tap closes it

  // ----- State -----
  var seamComplete = false;        // once per save; persisted (047)
  var seamExtractTiles = null;     // [{r,c}] while the crescendo runs, else null
  var seamExtractT0 = 0;           // performance.now() at seamExtract()
  var seamCreditsOn = false;       // EXPEDITION COMPLETE plate up
  var seamCreditsT0 = 0;
  var seamCreditsSparks = [];
  var seamCreditsLandedAt = -1;

  var ledgerData = {};             // ore type -> { n: count, shiny: count }; persisted (047)
  var ledgerOpen = false;

  // ----- Cyrillic stencil glyphs (ЖИЛА) -----
  // The console stencil font (220) is Latin-only; the seam's name needs four
  // Cyrillic letters. Same 5x7 'X'/'.' bitmap contract as STENCIL_FONT.
  var SEAM_CYR_FONT = {
    'Ж': ['X.X.X','X.X.X','.XXX.','..X..','.XXX.','X.X.X','X.X.X'],
    'И': ['X...X','X...X','X..XX','X.X.X','XX..X','X...X','X...X'],
    'Л': ['.XXXX','.X..X','.X..X','.X..X','.X..X','.X..X','X...X'],
    'А': ['.XXX.','X...X','X...X','XXXXX','X...X','X...X','X...X']
  };
  function drawSeamCyrText(str, x, y, scale, color) {
    ctx.fillStyle = color;
    var advance = 6 * scale;
    for (var i = 0; i < str.length; i++) {
      var rows = SEAM_CYR_FONT[str.charAt(i)];
      if (!rows) continue;
      for (var row = 0; row < 7; row++) {
        var line = rows[row];
        for (var col = 0; col < 5; col++) {
          if (line.charCodeAt(col) === 88) {
            ctx.fillRect(x + i * advance + col * scale, y + row * scale, scale, scale);
          }
        }
      }
    }
    return str.length * advance - scale;
  }

  // ----- The Great Seam tile renderer -----
  // Molten gold vein, clearly THE prize. Dispatched from drawEarlyOreBase
  // (120) on the LIVE tile path only; the pulse + sparkles animate every
  // frame, so this must never join the early-ore atlas (the legendary
  // exception MINERALS_BIBLE §7 reserves animation for). Geometry is keyed
  // entirely off tileHash01(r, c, seed): no neighbour reads, so the 5x2 seam
  // block merges into one continuous molten body across tile edges.
  function drawGreatSeam(tx, ty, r, c) {
    var tNow = performance.now() / 1000;
    var phase = tileHash01(r, c, 0x5EA0) * 6.2832;
    var pulse = 0.5 + 0.5 * Math.sin(tNow * 1.8 + phase);
    var OUT = '#3a1c08';        // outline ring
    var DEEP = '#7a3e0c';       // dark interior pools
    var BASE = '#b06614';       // molten body
    var HI = '#ffd24a';         // hot gold (the headline colour)
    var HOT = '#fff0a0';        // white-hot vein cores
    var SHADE = '#5a2c0a';      // lower-right soft shadow

    // 1) Molten mass in 2px blocks with a ragged 0-2 px host margin, lit
    // from the upper-left (outline rim, gold highlight band, base interior,
    // soft shadow toward the lower-right).
    for (var by = 0; by < 16; by++) {
      for (var bx = 0; bx < 16; bx++) {
        var edge = Math.min(bx, by, 15 - bx, 15 - by);
        var rag = tileHash01(r, c, 0x5E10 + by * 16 + bx);
        if (edge === 0 && rag < 0.40) continue;          // host peeks through
        var fill;
        if (edge === 0 && rag < 0.72) fill = OUT;
        else if (edge === 0 || (edge === 1 && rag > 0.86)) fill = OUT;
        else {
          var lightT = (bx + by) / 30;
          var tone = tileHash01(r, c, 0x5E60 + by * 16 + bx);
          if (lightT < 0.30 && tone > 0.38) fill = HI;
          else if (lightT > 0.74 && tone > 0.42) fill = SHADE;
          else fill = tone < 0.20 ? DEEP : BASE;
        }
        ctx.fillStyle = fill;
        ctx.fillRect(tx + bx * 2, ty + by * 2, 2, 2);
      }
    }

    // 2) Bright branching veining: two deterministic 1px random walks left
    // to right, breathing with the pulse.
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    for (var v = 0; v < 2; v++) {
      var vx = 3 + tileHash01(r, c, 0x5EA8 + v) * 6;
      var vy = 6 + tileHash01(r, c, 0x5EB0 + v) * 20;
      for (var s = 0; s < 14; s++) {
        var h = tileHash01(r, c, 0x5EC0 + v * 40 + s);
        vx += 1 + (h > 0.6 ? 1 : 0);
        vy += (h - 0.5) * 3;
        if (vx > 29 || vy < 2 || vy > 29) break;
        ctx.fillStyle = HOT;
        ctx.fillRect(tx + (vx | 0), ty + (vy | 0), 2, 1);
        if (h > 0.72) {                                  // branch droplet
          ctx.fillStyle = HI;
          ctx.fillRect(tx + (vx | 0), ty + ((vy | 0) + 1), 1, 1);
        }
      }
    }
    ctx.globalAlpha = 1;

    // 3) Pulsing inner glow: additive wash over the core so the seam reads
    // as heat, not paint.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.08 + 0.14 * pulse;
    ctx.fillStyle = '#ffcf5a';
    ctx.fillRect(tx + 5, ty + 5, TILE - 10, TILE - 10);
    ctx.restore();

    // 4) Twinkling sparkles (the drawShinyTile vocabulary, fewer arms).
    for (var si = 0; si < 3; si++) {
      var sp = tileHash01(r, c, 0x5F00 + si) * 6.2832;
      var tw = 0.5 + 0.5 * Math.sin(tNow * 3.4 + sp);
      if (tw < 0.30) continue;
      var sx2 = tx + 4 + tileHash01(r, c, 0x5F20 + si) * (TILE - 8);
      var sy2 = ty + 4 + tileHash01(r, c, 0x5F40 + si) * (TILE - 8);
      var arm = 1 + Math.round(tw * 2);
      ctx.fillStyle = 'rgba(255,244,200,' + (0.85 * tw).toFixed(3) + ')';
      ctx.fillRect(sx2 - arm, sy2, arm * 2 + 1, 1);
      ctx.fillRect(sx2, sy2 - arm, 1, arm * 2 + 1);
    }
  }

  // ----- Extraction sequence -----
  // The drill code calls seamExtract(r, c) when the player drills a
  // 'greatseam' tile (the tile itself is hp 999999 so the drill never breaks
  // it; this is the special-cased extraction). First call collects the whole
  // connected seam and arms the crescendo; drawSeamFx() finishes the job.
  function seamExtract(r, c) {
    if (seamComplete || seamExtractTiles) return false;
    var t = world[r] && world[r][c];
    if (!t || t.type !== 'greatseam') return false;
    // Flood-fill the 4-connected greatseam block from the drilled tile.
    var tiles = [];
    var seen = {};
    var stack = [{ r: r, c: c }];
    seen[r + ':' + c] = true;
    while (stack.length) {
      var cur = stack.pop();
      tiles.push(cur);
      var DR = [-1, 1, 0, 0], DC = [0, 0, -1, 1];
      for (var d = 0; d < 4; d++) {
        var nr = cur.r + DR[d], nc = cur.c + DC[d];
        var key = nr + ':' + nc;
        if (seen[key]) continue;
        var nt = world[nr] && world[nr][nc];
        if (nt && nt.type === 'greatseam') {
          seen[key] = true;
          stack.push({ r: nr, c: nc });
        }
      }
    }
    seamExtractTiles = tiles;
    seamExtractT0 = performance.now();
    return true;
  }

  function seamFinishExtract() {
    if (!seamExtractTiles) return;
    var tiles = seamExtractTiles;
    // Seam centre (world px) for the floaters.
    var sumX = 0, sumY = 0;
    for (var i = 0; i < tiles.length; i++) {
      sumX += (tiles[i].c + 0.5) * TILE;
      sumY += (tiles[i].r + 0.5) * TILE;
    }
    var cx = sumX / tiles.length, cy = sumY / tiles.length;
    money += SEAM_REWARD;
    try {
      spawnFloater(cx, cy - 10, 'CORE SAMPLE SECURED', '#ffd24a', true);
      spawnFloater(cx, cy + 8, '+$' + SEAM_REWARD.toLocaleString(), '#FFD700', true);
    } catch (e) {}
    // The seam tiles convert to normal gold ore, so the chamber stays
    // interesting but the event is once per save.
    for (var k = 0; k < tiles.length; k++) {
      var tr = tiles[k].r, tc = tiles[k].c;
      if (world[tr] && world[tr][tc] && world[tr][tc].type === 'greatseam') {
        world[tr][tc] = { type: 'gold', hp: ORES.gold.hp, shiny: false };
      }
      invalidateTerrainAround(tr, tc);
    }
    seamExtractTiles = null;
    seamComplete = true;
    seamCreditsOn = true;
    // The reveal shimmer under the EXPEDITION COMPLETE plate (Affect: it
    // ducks the music + effects under itself; tonal layer is music-side).
    sfxPlay('discovery', { gain: 1.2 });
    seamCreditsT0 = performance.now();
    seamCreditsSparks = [];
    seamCreditsLandedAt = -1;
  }

  function seamCreditsActive() { return seamCreditsOn; }

  function seamCreditsDismiss() {
    if (!seamCreditsOn) return false;
    if ((performance.now() - seamCreditsT0) / 1000 < SEAM_PLATE_PRE_S + SEAM_DISMISS_MIN_S) return false;
    seamCreditsOn = false;
    seamCreditsSparks = [];
    return true;
  }

  // Self-handled dismiss: any key / click / tap while the plate is up.
  // Capture phase so it fires regardless of the game handlers; the dismiss
  // itself is idempotent and time-gated, so a stray double event is harmless.
  try {
    window.addEventListener('keydown', function () {
      if (seamCreditsOn) seamCreditsDismiss();
    }, true);
    window.addEventListener('mousedown', function () {
      if (seamCreditsOn) seamCreditsDismiss();
    }, true);
    window.addEventListener('touchstart', function () {
      if (seamCreditsOn) seamCreditsDismiss();
    }, true);
  } catch (e) {}

  // ----- Render dispatch (called from 140's UI overlay section) -----
  // Handles both halves of the sequence: the on-tile crescendo overlay and
  // the EXPEDITION COMPLETE plate. Self-gates, so the call site stays bare.
  function drawSeamFx() {
    if (seamExtractTiles && !seamComplete) {
      var elapsed = (performance.now() - seamExtractT0) / 1000;
      if (elapsed >= SEAM_EXTRACT_S) {
        seamFinishExtract();
      } else {
        drawSeamCrescendo(elapsed / SEAM_EXTRACT_S);
      }
    }
    if (seamCreditsOn) drawSeamCredits();
  }

  // Shake/glow crescendo over the seam tiles while the core sample is cut.
  // Drawn in UI (CSS px) space; world maps by (worldX - cam.x) * worldScale.
  function drawSeamCrescendo(p) {
    var sc = worldScale || 1;
    var tNow = performance.now() / 1000;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < seamExtractTiles.length; i++) {
      var t = seamExtractTiles[i];
      var jAmp = 3 * p;
      var jx = Math.sin(tNow * 47 + i * 1.7) * jAmp;
      var jy = Math.cos(tNow * 53 + i * 2.3) * jAmp;
      var sx = (t.c * TILE - cam.x) * sc + jx;
      var sy = (t.r * TILE - cam.y) * sc + jy;
      var size = TILE * sc;
      var flicker = 0.75 + 0.25 * Math.sin(tNow * 21 + i);
      ctx.fillStyle = 'rgba(255,210,74,' + ((0.15 + 0.45 * p) * flicker).toFixed(3) + ')';
      ctx.fillRect(sx - 2, sy - 2, size + 4, size + 4);
      if (p > 0.8) {
        // White-hot flash ramp over the last half second.
        ctx.fillStyle = 'rgba(255,248,225,' + (((p - 0.8) / 0.2) * 0.75).toFixed(3) + ')';
        ctx.fillRect(sx - 2, sy - 2, size + 4, size + 4);
      }
    }
    ctx.restore();
  }

  // ----- EXPEDITION COMPLETE plate -----
  // Modeled on the death screen's steel plate (290) but triumphant: warm gold
  // dim instead of red, the ЖИЛА star over the title, brass stats plate, and
  // the game simply continues underneath. Any tap/click/key dismisses.
  function seamPlateRect() {
    return { x: 0, y: 0, w: viewW, h: Math.floor(viewH * 0.60) };
  }

  function drawSeamStar(cx, cy, R) {
    // Five-point star, red enamel with a brass rim (BUILDING_STYLE motif).
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rad = (i % 2 === 0) ? R : R * 0.42;
      pts.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < 10; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.closePath();
    ctx.fillStyle = '#a01a14';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#e8b830';
    ctx.stroke();
    // Upper-left facet light.
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fillStyle = '#c83830';
    ctx.fill();
  }

  function drawSeamCredits() {
    var dt = lastFrameDt || 1 / 60;
    var phaseT = (performance.now() - seamCreditsT0) / 1000;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Phase 1: warm gold dim (triumphant, not the death screen's red).
    var dimT = Math.min(1, phaseT / SEAM_PLATE_PRE_S);
    ctx.fillStyle = 'rgba(60,44,8,' + (0.40 * dimT).toFixed(3) + ')';
    ctx.fillRect(0, 0, viewW, viewH);
    var vignette = ctx.createRadialGradient(viewW / 2, viewH / 2, viewW * 0.25, viewW / 2, viewH / 2, viewW * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,' + (0.40 * dimT).toFixed(3) + ')');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, viewW, viewH);

    // Phase 2: plate descends with cubic ease-out + landing bounce.
    var P = seamPlateRect();
    var slideT = 0, slideEased = 0;
    if (phaseT > SEAM_PLATE_PRE_S) {
      slideT = Math.min(1, (phaseT - SEAM_PLATE_PRE_S) / SEAM_PLATE_SLIDE_S);
      slideEased = 1 - Math.pow(1 - slideT, 3);
    }
    var bounce = 0;
    if (slideT >= 1) {
      if (seamCreditsLandedAt < 0) {
        seamCreditsLandedAt = phaseT;
        for (var sp = 0; sp < 30; sp++) {
          seamCreditsSparks.push({
            x: P.x + Math.random() * P.w,
            y: P.y + P.h,
            vx: (Math.random() - 0.5) * 6,
            vy: -1 - Math.random() * 5,
            t: 0.5 + Math.random() * 0.6,
            color: Math.random() > 0.4 ? '#ffd060' : '#fff0a0',
            size: 1 + Math.floor(Math.random() * 2)
          });
        }
      }
      var bT = (phaseT - seamCreditsLandedAt) / SEAM_PLATE_BOUNCE_S;
      if (bT < 1) bounce = 18 * Math.exp(-bT * 5) * Math.sin(bT * 18);
    }
    var py = -P.h + Math.floor(P.h * slideEased + bounce);
    var px = P.x, pw = P.w, ph = P.h;

    // ---- Plate body (multi-panel steel, same construction as 290) ----
    ctx.fillStyle = UI_OUTLINE;
    ctx.fillRect(px - 2, py + ph - 2, pw + 4, 2);
    var panelDivisions = [0, 0.32, 0.62, 1.0];
    for (var pi = 0; pi < 3; pi++) {
      var panelTop = py + Math.floor(ph * panelDivisions[pi]);
      var panelBot = py + Math.floor(ph * panelDivisions[pi + 1]);
      var panelH = panelBot - panelTop;
      ctx.fillStyle = pi === 1 ? '#3d3a35' : (pi === 0 ? '#404038' : '#363330');
      ctx.fillRect(px, panelTop, pw, panelH);
      ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT;
      ctx.fillRect(px, panelTop, pw, 1);
      ctx.fillStyle = UIMAT_PLATE_SHADOW;
      ctx.fillRect(px, panelBot - 1, pw, 1);
      for (var bsx = px + 24; bsx < px + pw - 24; bsx += 7) {
        ctx.fillStyle = 'rgba(64,60,52,' + (0.10 + (pi * 0.04)).toFixed(3) + ')';
        ctx.fillRect(bsx, panelTop + 4, 1, panelH - 8);
      }
      if (pi < 2) {
        ctx.fillStyle = UIMAT_WELD;
        ctx.fillRect(px, panelBot, pw, 1);
        ctx.fillStyle = '#1a0a05';
        ctx.fillRect(px, panelBot + 1, pw, 1);
        for (var srx = px + 28; srx < px + pw - 16; srx += 32) {
          drawConsoleRivet(srx, panelBot - 2);
          drawConsoleRivet(srx, panelBot + 4);
        }
      }
    }
    drawIronBracket(px + 6, py + 6, 36, 36, false, false);
    drawIronBracket(px + pw - 42, py + 6, 36, 36, true, false);
    drawIronBracket(px + 6, py + ph - 42, 36, 36, false, true);
    drawIronBracket(px + pw - 42, py + ph - 42, 36, 36, true, true);

    // ---- Plate content (fades in once mostly down) ----
    if (slideT >= 0.7) {
      var contentAlpha = Math.min(1, (slideT - 0.7) * 4);
      ctx.save();
      ctx.globalAlpha = contentAlpha;

      var midX = px + Math.floor(pw / 2);
      var starY = py + Math.floor(ph * 0.20);

      // Warm radial glow behind the star.
      var glow = ctx.createRadialGradient(midX, starY, 4, midX, starY, 96);
      glow.addColorStop(0, 'rgba(255,210,74,0.45)');
      glow.addColorStop(1, 'rgba(255,210,74,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(midX - 100, starY - 80, 200, 160);

      // The ЖИЛА star.
      ctx.save();
      ctx.translate(2, 2);
      ctx.globalAlpha = contentAlpha * 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(midX, starY, 30, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.globalAlpha = contentAlpha;
      drawSeamStar(midX, starY, 30);
      var cyrW = 4 * 12 - 2;   // 4 glyphs at scale 2 (6px advance per scale)
      drawSeamCyrText('ЖИЛА', midX - Math.floor(cyrW / 2), starY + 38, 2, '#e8b830');

      // EXPEDITION COMPLETE with ink-bleed halo.
      var tStr = 'EXPEDITION COMPLETE';
      var tScale = (pw < 720) ? 2 : 3;
      var tw = stencilTextWidth(tStr, tScale);
      var tX = midX - Math.floor(tw / 2);
      var tY = starY + 62;
      var bleedColor = 'rgba(46,32,4,0.55)';
      for (var bo = -1; bo <= 1; bo++) {
        for (var bo2 = -1; bo2 <= 1; bo2++) {
          if (bo === 0 && bo2 === 0) continue;
          drawStencilText(tStr, tX + bo, tY + bo2, tScale, bleedColor);
        }
      }
      drawStencilText(tStr, tX, tY, tScale, '#d8d2c4');
      ctx.fillStyle = 'rgba(212,168,56,0.7)';
      ctx.fillRect(tX - 8, tY + tScale * 7 + 4, tw + 16, 2);

      // Brass stats plate.
      var bpW = Math.min(420, pw - 100);
      var bpH = 80;
      var bpX = midX - Math.floor(bpW / 2);
      var bpY = tY + tScale * 7 + 18;
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(bpX - 3, bpY - 3, bpW + 6, bpH + 6);
      ctx.fillStyle = '#4f3a1b';
      ctx.fillRect(bpX, bpY, bpW, bpH);
      ctx.fillStyle = '#7a5a2c';
      ctx.fillRect(bpX + 2, bpY + 2, bpW - 4, bpH - 4);
      ctx.fillStyle = '#a07c40';
      ctx.fillRect(bpX + 2, bpY + 2, bpW - 4, 2);
      ctx.fillStyle = '#4f3a1b';
      ctx.fillRect(bpX + 2, bpY + bpH - 4, bpW - 4, 2);
      drawBrassBolt(bpX + 8, bpY + 8);
      drawBrassBolt(bpX + bpW - 10, bpY + 8);
      drawBrassBolt(bpX + 8, bpY + bpH - 10);
      drawBrassBolt(bpX + bpW - 10, bpY + bpH - 10);
      var hdr = 'EXPEDITION RECORD';
      var hdrW = stencilTextWidth(hdr, 1);
      drawStencilText(hdr, bpX + Math.floor((bpW - hdrW) / 2), bpY + 6, 1, '#1f1408');
      // Stats: depth record, cash, ore types catalogued (from the ledger).
      var lc = ledgerCounts();
      var leftCol = bpX + 22;
      var rightCol = bpX + bpW - 22;
      var depthStr = (depthRecord || 0) + 'M';
      var cashStr = '$' + (money || 0).toLocaleString();
      var minStr = lc.got + '/' + lc.total;
      drawStencilText('DEPTH', leftCol, bpY + 20, 2, '#1f1408');
      drawStencilText(depthStr, rightCol - stencilTextWidth(depthStr, 2), bpY + 20, 2, '#1f1408');
      drawStencilText('CASH', leftCol, bpY + 38, 2, '#1f1408');
      drawStencilText(cashStr, rightCol - stencilTextWidth(cashStr, 2), bpY + 38, 2, '#1f1408');
      drawStencilText('MINERALS', leftCol, bpY + 56, 2, '#1f1408');
      drawStencilText(minStr, rightCol - stencilTextWidth(minStr, 2), bpY + 56, 2, '#1f1408');

      // SLUICE + footer.
      var sStr = 'SLUICE';
      var sW = stencilTextWidth(sStr, 3);
      drawStencilText(sStr, midX - Math.floor(sW / 2), bpY + bpH + 16, 3, '#d4a838');
      var fStr = 'THE DIG CONTINUES...';
      var fW = stencilTextWidth(fStr, 1);
      drawStencilText(fStr, midX - Math.floor(fW / 2), bpY + bpH + 42, 1, 'rgba(216,210,196,0.75)');

      // Tap-to-continue hint.
      var hintStr = isMobile ? 'TAP TO CONTINUE' : 'CLICK TO CONTINUE';
      var hw = stencilTextWidth(hintStr, 2);
      var hintPulse = 0.7 + 0.3 * Math.sin(phaseT * 3);
      drawStencilText(hintStr, midX - Math.floor(hw / 2), py + ph - 36, 2, 'rgba(212,168,56,' + hintPulse.toFixed(3) + ')');

      ctx.restore();
    }

    // ---- Gold spark particles ----
    for (var pix = seamCreditsSparks.length - 1; pix >= 0; pix--) {
      var sk = seamCreditsSparks[pix];
      sk.x += sk.vx;
      sk.y += sk.vy;
      sk.vy += 0.35;
      sk.t -= dt;
      if (sk.t <= 0) { seamCreditsSparks.splice(pix, 1); continue; }
      ctx.fillStyle = sk.color;
      ctx.globalAlpha = Math.min(1, sk.t * 2);
      ctx.fillRect(sk.x, sk.y, sk.size, sk.size);
      ctx.fillStyle = '#fff8e0';
      ctx.fillRect(sk.x, sk.y, 1, 1);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ----- Mineral Ledger -----
  function ledgerRecordOre(type, shiny) {
    if (!type || !ORES[type]) return;
    var e = ledgerData[type];
    if (!e) {
      e = ledgerData[type] = { n: 0, shiny: 0 };
      // First specimen of an ore the profile has never held: the discovery
      // shimmer (ledgerData persists in the save, so once per profile).
      sfxPlay('discovery');
    }
    e.n++;
    if (shiny) e.shiny++;
  }

  function ledgerToggle() {
    ledgerOpen = !ledgerOpen;
    return ledgerOpen;
  }

  // Every catalogue-worthy ore (excludes terrain, fixed-position unminables
  // and the seam itself), sorted shallow-to-deep then cheap-to-dear.
  var ledgerListCache = null;
  function ledgerOreList() {
    if (ledgerListCache) return ledgerListCache;
    var skip = { dirt: 1, stone: 1, foundation: 1, barrier: 1, jello: 1, bedrock: 1, voidrock: 1, greatseam: 1 };
    var list = [];
    for (var k in ORES) {
      if (!skip[k]) list.push(k);
    }
    list.sort(function (a, b) {
      return (ORES[a].minDepth - ORES[b].minDepth) || (ORES[a].value - ORES[b].value);
    });
    ledgerListCache = list;
    return list;
  }

  function ledgerCounts() {
    var list = ledgerOreList();
    var got = 0, shiny = 0;
    for (var i = 0; i < list.length; i++) {
      var e = ledgerData[list[i]];
      if (e && e.n > 0) got++;
      if (e) shiny += e.shiny || 0;
    }
    return { got: got, total: list.length, shiny: shiny };
  }

  // One ledger specimen tile drawn with the REAL renderer on a dirt host,
  // exactly the 140 tile path (atlas first, then clipped drawEarlyOreBase)
  // with a fixed synthetic (r, c) per type so the specimen never changes.
  function drawLedgerSpecimen(tx, ty, type, idx) {
    var fr = 4001 + idx * 37;
    var fc = 4007 + idx * 53;
    // Dirt host underlay with a few darker specks.
    ctx.fillStyle = '#4a2e18';
    ctx.fillRect(tx, ty, TILE, TILE);
    ctx.fillStyle = '#3a2412';
    for (var s = 0; s < 6; s++) {
      var hx = tileHash01(fr, fc, 0x1ED0 + s);
      var hy = tileHash01(fr, fc, 0x1EE0 + s);
      ctx.fillRect(tx + ((hx * (TILE - 3)) | 0), ty + ((hy * (TILE - 3)) | 0), 2, 2);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(tx, ty, TILE, TILE);
    ctx.clip();
    if (!drawEarlyOreAtlas(tx, ty, fr, fc, type)) {
      oreDepositPath(tx, ty, fr, fc, type);
      ctx.clip();
      if (!drawEarlyOreBase(tx, ty, fr, fc, type)) {
        ctx.fillStyle = ORES[type].color;
        ctx.fillRect(tx, ty, TILE, TILE);
      }
    }
    ctx.restore();
  }

  // Full-screen MINERAL LEDGER page. Framed-panel look borrowed from the
  // shop sub-pages (230): dark backdrop, red iron-bracketed title banner,
  // stencil text throughout. Dispatched from 140 when ledgerOpen.
  function drawLedger() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Backdrop.
    ctx.fillStyle = '#16130f';
    ctx.fillRect(0, 0, viewW, viewH);

    // Title banner (the drawShopSubPageFrame red sign, standalone copy).
    var bannerW = Math.min(440, viewW - 96);
    var bannerH = 44;
    var bannerX = Math.floor((viewW - bannerW) / 2);
    var bannerY = 14;
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(bannerX - 2, bannerY - 2, bannerW + 4, bannerH + 4);
    ctx.fillStyle = '#5a1810';
    ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
    ctx.fillStyle = '#8c2820';
    ctx.fillRect(bannerX + 1, bannerY + 1, bannerW - 2, bannerH - 2);
    ctx.fillStyle = '#a83830';
    ctx.fillRect(bannerX + 1, bannerY + 1, bannerW - 2, 2);
    ctx.fillStyle = '#3a3530';
    ctx.fillRect(bannerX, bannerY, 8, 8);
    ctx.fillRect(bannerX + bannerW - 8, bannerY, 8, 8);
    ctx.fillRect(bannerX, bannerY + bannerH - 8, 8, 8);
    ctx.fillRect(bannerX + bannerW - 8, bannerY + bannerH - 8, 8, 8);
    ctx.fillStyle = '#5a5550';
    ctx.fillRect(bannerX + 2, bannerY + 2, 2, 2);
    ctx.fillRect(bannerX + bannerW - 4, bannerY + 2, 2, 2);
    ctx.fillRect(bannerX + 2, bannerY + bannerH - 4, 2, 2);
    ctx.fillRect(bannerX + bannerW - 4, bannerY + bannerH - 4, 2, 2);
    var title = 'MINERAL LEDGER';
    var tw = stencilTextWidth(title, 3);
    drawStencilText(title, bannerX + Math.floor((bannerW - tw) / 2), bannerY + Math.floor((bannerH - 21) / 2), 3, '#f0d088');

    // ---- Grid of specimens ----
    var list = ledgerOreList();
    var n = list.length;
    var gridTop = bannerY + bannerH + 16;
    var footerH = 30;
    var availW = viewW - 32;
    var availH = viewH - gridTop - footerH - 10;
    var cols = Math.max(2, Math.min(8, Math.floor(availW / 168)));
    var rows = Math.ceil(n / cols);
    // Widen until the rows fit the screen (min cell height 44).
    while (rows * 44 > availH && cols < 10) {
      cols++;
      rows = Math.ceil(n / cols);
    }
    var cellW = Math.floor(availW / cols);
    var cellH = Math.min(72, Math.max(44, Math.floor(availH / rows)));
    var gridW = cols * cellW;
    var gridX = Math.floor((viewW - gridW) / 2);

    for (var i = 0; i < n; i++) {
      var type = list[i];
      var def = ORES[type];
      var e = ledgerData[type];
      var collected = !!(e && e.n > 0);
      var cx = gridX + (i % cols) * cellW;
      var cy = gridTop + Math.floor(i / cols) * cellH;

      // Recessed cell panel.
      ctx.fillStyle = UI_OUTLINE;
      ctx.fillRect(cx + 1, cy + 1, cellW - 2, cellH - 2);
      ctx.fillStyle = UIMAT_BAY_RECESS;
      ctx.fillRect(cx + 2, cy + 2, cellW - 4, cellH - 4);
      ctx.fillStyle = UIMAT_BAY_RECESS_DARK;
      ctx.fillRect(cx + 2, cy + 2, cellW - 4, 1);
      ctx.fillStyle = UIMAT_BAY_RECESS_LIGHT;
      ctx.fillRect(cx + 2, cy + cellH - 3, cellW - 4, 1);

      var tileX = cx + 7;
      var tileY = cy + Math.floor((cellH - TILE) / 2);
      if (collected) {
        drawLedgerSpecimen(tileX, tileY, type, i);
      } else {
        // Dark silhouette: the slot exists, the mineral is unknown.
        ctx.fillStyle = '#0a0a0d';
        ctx.fillRect(tileX, tileY, TILE, TILE);
        ctx.fillStyle = 'rgba(216,210,196,0.18)';
        ctx.fillRect(tileX, tileY, TILE, 1);
      }
      // Thin frame around the specimen.
      ctx.fillStyle = UI_OUTLINE;
      ctx.fillRect(tileX - 1, tileY - 1, TILE + 2, 1);
      ctx.fillRect(tileX - 1, tileY + TILE, TILE + 2, 1);
      ctx.fillRect(tileX - 1, tileY, 1, TILE);
      ctx.fillRect(tileX + TILE, tileY, 1, TILE);

      var textX = tileX + TILE + 7;
      if (collected) {
        var label = (def.label || type).toUpperCase();
        var maxChars = Math.max(3, Math.floor((cx + cellW - 6 - textX) / 6));
        if (label.length > maxChars) label = label.slice(0, maxChars);
        drawStencilText(label, textX, cy + Math.floor(cellH / 2) - 15, 1, '#d8d2c4');
        drawStencilText('$' + (def.value || 0).toLocaleString(), textX, cy + Math.floor(cellH / 2) - 3, 1, '#d4a838');
        var countStr = 'X ' + e.n + (e.shiny ? ' !' + e.shiny : '');
        drawStencilText(countStr, textX, cy + Math.floor(cellH / 2) + 9, 1, '#9aa0a8');
      } else {
        drawStencilText('???', textX, cy + Math.floor(cellH / 2) - 3, 2, 'rgba(216,210,196,0.40)');
      }
    }

    // ---- Footer ----
    var lc = ledgerCounts();
    var footStr = lc.got + ' OF ' + lc.total + ' CATALOGUED';
    if (lc.shiny > 0) footStr += '  SHINY: ' + lc.shiny;
    var fw = stencilTextWidth(footStr, 2);
    drawStencilText(footStr, Math.floor((viewW - fw) / 2), viewH - footerH + 4, 2, '#d4a838');

    ctx.restore();
  }
