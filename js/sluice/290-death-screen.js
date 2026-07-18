  // ========================================================================
  // v24.142, Death screen: SALVAGE MANIFEST plate (UI_STYLE.md 9.1).
  // Owner-picked treatment 4 from the death-lab.html chooser (cb075e2).
  //   Phase 1 (0..1.35s): rig dies in place; the world desaturates to a
  //     cold grade under a vignette (no more red wash).
  //   Phase 2: the steel plate drops the FULL playfield height and locks
  //     onto the console with a kachunk. Landing sparks spray along the
  //     console line; the bounce dips behind the console (clip).
  //   Phase 3: an aged-paper SALVAGE MANIFEST bolted to the plate prints
  //     the lost cargo line by line (odometer count-ups), totals it, takes
  //     the 10% levy in red, states the remittance, then a SETTLED stamp
  //     slams in. A cause-keyed Ministry advisory line closes the report.
  //   Input (350): the first tap/click completes the report instantly,
  //   the next one recovers the rig. On respawn the plate raises over the
  //   live town (drawDeathPlateRaise, dispatched from 140).
  // Words live ON the plate, never floating over the world (owner rule).
  // Death economics shown = death economics charged (047 applyDeathPenalty).
  // ========================================================================
  var DEATH_PRE_PLATE_S = 1.35;
  var DEATH_PLATE_SLIDE_S = 0.40;
  var DEATH_BOUNCE_S = 0.55;
  var deathSparks = [];          // particles spawned at plate landing
  var deathLandedAt = -1;        // timestamp the plate first locked
  var deathManifest = null;      // per-death snapshot (cargo, fee, advisory)
  var deathStampAt = -1;         // deathPhaseT when the SETTLED stamp landed
  var DEATH_INK = '#26201a';     // typewriter ink on the manifest paper
  var DEATH_INK_DIM = '#5a5040';
  var DEATH_RED = '#a8281e';     // stamp + levy red
  var DEATH_RED_DARK = '#6a1a0e';

  function deathPlateRect() {
    // Full playfield: the plate lands exactly on the console's top edge.
    var ch = (typeof consoleHeight === 'function') ? consoleHeight() : 0;
    return { x: 0, y: 0, w: viewW, h: Math.max(120, Math.floor(viewH - ch)) };
  }

  function deathHash01(n) {
    var s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function deathSmooth(a, b, t) {
    t = Math.min(1, Math.max(0, (t - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  // Eased odometer count: 0 -> to over dur seconds starting at start.
  function deathOdo(t, start, dur, to) {
    if (t <= start) return 0;
    var k = Math.min(1, (t - start) / dur);
    k = 1 - Math.pow(1 - k, 3);
    return Math.round(to * k);
  }

  // Ministry advisory lines, cause-keyed, rotated by the lifetime incident
  // number so death 30 reads differently than death 3.
  function deathAdvisoryLine(cause, n) {
    var pool;
    if (cause === 'magma' || cause === 'burned') {
      pool = ['MAGMA IS NOT A SHORTCUT.',
              'THE MANTLE ACCEPTS ALL DONATIONS.',
              'HEAT SHIELDING: SEE CATALOG, PAGE 7.'];
    } else if (cause === 'water' || cause === 'drowned') {
      pool = ['THE RIG DOES NOT SWIM.',
              'BUOYANCY WAS NOT REQUISITIONED.',
              'AIR IS ISSUED FOR BREATHING, NOT BALLAST.'];
    } else if (cause === 'fuel') {
      pool = ['THE GAUGE FACES THE OPERATOR.',
              'HOPE IS NOT A PROPELLANT.',
              'REFUELING WAS AVAILABLE AT TOWN ' + (((typeof lastDockTown === 'number' ? lastDockTown : 0) | 0) + 1) + '.'];
    } else if (cause === 'bomb') {
      pool = ['THE SAFETY RADIUS IS PRINTED ON THE CRATE.',
              'STAND WITH THE CREW, NOT THE CHARGE.',
              'DEMOLITION REWARDS PATIENCE.'];
    } else if (cause === 'fall') {
      pool = ['THE FLOOR FILED NO COMPLAINT.',
              'ALTITUDE IS A PRIVILEGE, NOT A RIGHT.',
              'GRAVITY PERFORMED TO SPECIFICATION.'];
    } else {
      pool = ['MAINTENANCE WAS AVAILABLE AT EVERY TOWN.',
              'THE ROCK ALWAYS WINS ON POINTS.',
              'STEEL FORGIVES NOTHING.'];
    }
    return pool[n % pool.length];
  }

  // Snapshot the incident at the moment of death so the report stays true
  // even if an autosave applies the penalty (clears cargo, debits the fee)
  // while the plate is still up.
  function buildDeathManifest() {
    // Lifetime incident counter: the KOMENDATURA's ledger, not the rig's.
    // Survives New Game on purpose (the Ministry remembers).
    var n = 1;
    try {
      n = (parseInt(localStorage.getItem('sluice.deaths'), 10) || 0) + 1;
      localStorage.setItem('sluice.deaths', String(n));
    } catch (e) { /* private mode etc: report stays NO. 0001 */ }
    var cause = (deathInfo && deathInfo.type) || 'hull';
    // Economics: if the penalty already ran this death, reconstruct the
    // pre-fee balance so the bill matches what was actually charged.
    var fee, balance;
    if (typeof applyDeathPenalty === 'function' && applyDeathPenalty._done) {
      fee = applyDeathPenalty._fee || 0;
      balance = (money || 0) + fee;
    } else {
      balance = money || 0;
      fee = Math.floor(balance * 0.10);
    }
    // Group the hold like sellCargo does: per ore type, shiny units form
    // their own stack (no shiny value premium yet, same as the trade desk).
    var groups = {}, order = [];
    for (var i = 0; i < cargo.length; i++) {
      var u = cargo[i];
      var ty = (u && u.type) ? u.type : (typeof u === 'string' ? u : 'coal');
      var sh = !!(u && u.shiny);
      var k = ty + (sh ? '*' : '');
      if (!groups[k]) { groups[k] = { type: ty, shiny: sh, count: 0 }; order.push(k); }
      groups[k].count++;
    }
    var lines = [], total = 0;
    for (var gi = 0; gi < order.length; gi++) {
      var g = groups[order[gi]];
      var def = ORES[g.type];
      var value = (def ? def.value : 0) * g.count;
      lines.push({
        label: (g.shiny ? 'SHINY ' : '') + ((def && def.label) || g.type).toUpperCase() + ' X' + g.count,
        chip: g.shiny ? '#ffe6a0' : ((def && def.color) || '#8a8a8a'),
        value: value
      });
      total += value;
    }
    lines.sort(function (a, b) { return b.value - a.value; });
    // Fit the paper: cap the printed rows, sweep the tail into one line.
    var plateHNow = deathPlateRect().h;
    var maxRows = Math.max(1, Math.min(6, Math.floor((Math.min(plateHNow - 100, 420) - 296) / 22) + 1));
    var visLines = lines;
    if (lines.length > maxRows) {
      visLines = lines.slice(0, maxRows - 1);
      var restCount = 0, restValue = 0;
      for (var ri = maxRows - 1; ri < lines.length; ri++) {
        restCount += parseInt(lines[ri].label.split(' X')[1], 10) || 0;
        restValue += lines[ri].value;
      }
      visLines.push({ label: 'OTHER ORES X' + restCount, chip: '#8a8a8a', value: restValue });
    }
    if (!visLines.length) visLines = [{ label: 'HOLD EMPTY', chip: '#6a665e', value: 0 }];
    var depthM = (typeof player !== 'undefined' && player)
      ? Math.max(0, Math.floor((player.y / TILE) - SKY_ROWS + 1)) : (depthRecord || 0);
    return {
      no: n,
      noStr: n < 10000 ? ('000' + n).slice(-4) : String(n),
      cause: cause,
      depth: depthM,
      visLines: visLines,
      total: total,
      balance: balance,
      fee: fee,
      remitted: balance - fee,
      flavor: deathAdvisoryLine(cause, n)
    };
  }

  // Content clock: manifest printing starts shortly after the plate locks.
  function deathContentT0() { return DEATH_PRE_PLATE_S + DEATH_PLATE_SLIDE_S + 0.22; }
  function deathRevealEndT() {
    var rows = deathManifest ? deathManifest.visLines.length : 1;
    return deathContentT0() + 0.35 + rows * 0.42 + 0.75 + 0.4 + 0.85 + 0.45 + 0.45;
  }
  // First tap completes the report instantly (every element is a pure
  // function of deathPhaseT); returns true if it consumed the tap. 350
  // calls this before respawning.
  function deathManifestSkip() {
    if (!UI_NEW || !gameOver) return false;
    var end = deathRevealEndT();
    if (deathPhaseT < end - 0.05) { deathPhaseT = end; return true; }
    return false;
  }

  // The bare steel plate (panels, seams, rivets, brackets, chains). Shared
  // by the death screen and the post-respawn raise-out.
  function drawDeathPlateBody(px, py, pw, ph) {
    // Outer outline along the landing edge
    ctx.fillStyle = UI_OUTLINE;
    ctx.fillRect(px - 2, py + ph - 2, pw + 4, 2);
    // Three horizontal panels separated by riveted weld seams.
    var panelDivisions = [0, 0.32, 0.62, 1.0];
    for (var pi = 0; pi < 3; pi++) {
      var panelTop = py + Math.floor(ph * panelDivisions[pi]);
      var panelBot = py + Math.floor(ph * panelDivisions[pi + 1]);
      var panelH = panelBot - panelTop;
      // Slightly different shade per panel for "different sheet metal" feel
      ctx.fillStyle = pi === 1 ? '#3d3a35' : (pi === 0 ? '#404038' : '#363330');
      ctx.fillRect(px, panelTop, pw, panelH);
      // Top highlight
      ctx.fillStyle = UIMAT_PLATE_HIGHLIGHT;
      ctx.fillRect(px, panelTop, pw, 1);
      // Bottom shadow
      ctx.fillStyle = UIMAT_PLATE_SHADOW;
      ctx.fillRect(px, panelBot - 1, pw, 1);
      // Decorative brushed-metal vertical streaks (subtle)
      for (var bsx = px + 24; bsx < px + pw - 24; bsx += 7) {
        ctx.fillStyle = 'rgba(64,60,52,' + (0.10 + (pi * 0.04)).toFixed(3) + ')';
        ctx.fillRect(bsx, panelTop + 4, 1, panelH - 8);
      }
      // Riveted weld seam between panels (skip last)
      if (pi < 2) {
        ctx.fillStyle = UIMAT_WELD;
        ctx.fillRect(px, panelBot, pw, 1);
        ctx.fillStyle = '#1a0a05';
        ctx.fillRect(px, panelBot + 1, pw, 1);
        // Rivets along the seam
        for (var srx = px + 28; srx < px + pw - 16; srx += 32) {
          drawConsoleRivet(srx, panelBot - 2);
          drawConsoleRivet(srx, panelBot + 4);
        }
      }
    }
    // Iron L-brackets on all 4 corners
    drawIronBracket(px + 6,           py + 6,              36, 36, false, false);
    drawIronBracket(px + pw - 42,     py + 6,              36, 36, true, false);
    drawIronBracket(px + 6,           py + ph - 42,        36, 36, false, true);
    drawIronBracket(px + pw - 42,     py + ph - 42,        36, 36, true, true);
    // Hanging-chain stubs above the top edge (visible during the descent;
    // suggests the plate rides on cables)
    function drawChainStub(cx) {
      ctx.fillStyle = '#1a0a05';
      ctx.fillRect(cx - 2, py - 14, 4, 14);
      ctx.fillStyle = '#5a5550';
      ctx.fillRect(cx - 1, py - 12, 2, 2);
      ctx.fillRect(cx - 1, py - 8, 2, 2);
      ctx.fillRect(cx - 1, py - 4, 2, 2);
    }
    drawChainStub(px + 24);
    drawChainStub(px + pw - 24);
  }

  // Aged manifest paper on a steel backing, with tarnish specks.
  function drawDeathPaper(fx, fy, fw, fh) {
    ctx.fillStyle = '#1a0a05'; ctx.fillRect(fx - 4, fy - 4, fw + 8, fh + 8);
    ctx.fillStyle = '#3d3a35'; ctx.fillRect(fx - 3, fy - 3, fw + 6, fh + 6);
    ctx.fillStyle = '#c9bfa8'; ctx.fillRect(fx, fy, fw, fh);
    ctx.fillStyle = '#b8ae96';
    ctx.fillRect(fx, fy + fh - 3, fw, 3);
    for (var i = 0; i < 22; i++) {
      ctx.fillRect(fx + Math.floor(deathHash01(i * 5.1) * fw),
                   fy + Math.floor(deathHash01(i * 9.7) * fh), 2, 1);
    }
  }

  // Rubber stamp: overshoot slam, slight angle, uneven ink. The one big
  // juice beat of the report. Speckles are painted in the paper colour
  // (NOT erased) so nothing punches through to the world below.
  function drawDeathStamp(text, cx, cy, landT, t) {
    if (t < landT) return;
    var k = Math.min(1, (t - landT) / 0.13);
    k = k * k * k;
    var sc = 1.8 + (1.0 - 1.8) * k;
    var alpha = 0.2 + (0.92 - 0.2) * k;
    if (deathStampAt < 0) {
      deathStampAt = deathPhaseT;   // shake impulse hook
      if (typeof sfxPlay === 'function') sfxPlay('ui-confirm', { gain: 1.0 });
    }
    var s = 3;
    var w = stencilTextWidth(text, s) + 26;
    var h = 7 * s + 22;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.075);
    ctx.scale(sc, sc);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = DEATH_RED;
    ctx.fillRect(-w / 2, -h / 2, w, 3);
    ctx.fillRect(-w / 2, h / 2 - 3, w, 3);
    ctx.fillRect(-w / 2, -h / 2, 3, h);
    ctx.fillRect(w / 2 - 3, -h / 2, 3, h);
    drawStencilText(text, -Math.floor(stencilTextWidth(text, s) / 2), -Math.floor(7 * s / 2), s, DEATH_RED);
    ctx.globalAlpha = alpha * 0.7;
    ctx.fillStyle = '#c9bfa8';
    for (var i = 0; i < 26; i++) {
      ctx.fillRect(Math.floor((deathHash01(i * 7.7) - 0.5) * w),
                   Math.floor((deathHash01(i * 3.3) - 0.5) * h), 2, 1);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Post-respawn beat: the plate lifts off the live town over ~0.3s (the
  // bible's hydraulic raise). Self-gated on the gameOver falling edge;
  // dispatched every frame from 140. Also hosts the ?deathshot=CAUSE boot
  // lever (kills the rig on the first live frame with a seeded hold, so a
  // headless run can screenshot the manifest; dev tooling, like ?treeshot).
  var deathRaiseT = -1;
  var deathWasOver = false;
  var DEATHSHOT = (function () {
    try {
      var m = location.search.match(/[?&]deathshot=([a-z]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  })();
  function drawDeathPlateRaise(dt) {
    if (!UI_NEW) return;
    // Companion lever ?deathskip=1: once the plate has locked, jump the
    // clock to the settled end-state (headless screenshots land on the
    // finished report instead of racing the cascade).
    if (DEATHSHOT && gameOver && /[?&]deathskip=1/.test(location.search) &&
        deathPhaseT > DEATH_PRE_PLATE_S + DEATH_PLATE_SLIDE_S + 0.05) {
      deathManifestSkip();
    }
    if (DEATHSHOT && !drawDeathPlateRaise._shot && !gameOver &&
        typeof endGame === 'function' && typeof player !== 'undefined' && player) {
      drawDeathPlateRaise._shot = true;
      if (!cargo.length) {
        var seed = [['gold', 2], ['silver', 3], ['iron', 5], ['coal', 8], ['amber', 1]];
        for (var si = 0; si < seed.length; si++) {
          for (var sj = 0; sj < seed[si][1]; sj++) cargo.push({ type: seed[si][0], shiny: false });
        }
        cargo.push({ type: 'gold', shiny: true });
      }
      if ((money | 0) <= 0) money = 8920;
      endGame({ type: DEATHSHOT, speed: 2150, heat: 2400 });
    }
    if (gameOver) { deathWasOver = true; deathRaiseT = -1; return; }
    if (deathWasOver) { deathWasOver = false; deathRaiseT = 0; }
    // Alive: arm a fresh snapshot for the next death (covers restart paths
    // that don't reset deathPhaseT, e.g. dev-mode R -> init()).
    deathManifest = null;
    deathPhaseT = 0;
    if (deathRaiseT < 0) return;
    deathRaiseT += dt;
    var k = deathRaiseT / 0.3;
    if (k >= 1) { deathRaiseT = -1; return; }
    var P = deathPlateRect();
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.beginPath();
    ctx.rect(0, 0, viewW, P.h);
    ctx.clip();
    drawDeathPlateBody(0, -Math.floor(P.h * (k * k * k)), viewW, P.h);
    ctx.restore();
  }

  // v25.63 — draw a receipt summary row (bold label left, value right-aligned)
  // that never lets the two collide on a narrow portrait plate. The manifest was
  // authored for a wide plate; on a portrait phone the paper is much narrower, so
  // a long scale-2 label ('SALVAGE LEVY 10%') ran straight into its value. If the
  // label + gap + value would overrun the row, both shrink to the largest scale
  // that fits (floored so they stay bold and legible).
  function drawDeathSummaryRow(label, valStr, hx, rightX, ly, sc, colL, colV) {
    var need = stencilTextWidth(label, sc) + 12 + stencilTextWidth(valStr, sc);
    var avail = rightX - hx;
    if (need > avail && need > 0) sc = Math.max(0.7, sc * (avail / need));
    drawStencilText(label, hx, ly, sc, colL);
    drawStencilText(valStr, rightX - stencilTextWidth(valStr, sc), ly, sc, colV);
  }

  function drawDeathScreen(dt) {
    if (!UI_NEW || !gameOver) return;
    // First frame of a new death: snapshot the incident before any
    // autosave can clear the hold or debit the fee.
    if (deathPhaseT === 0 || !deathManifest) {
      deathManifest = buildDeathManifest();
      deathStampAt = -1;
    }
    deathPhaseT += dt;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    // Phase 1: the world drains to a cold desaturated grade + vignette
    // while the rig dies in place (hot things stay hot one layer below us,
    // since the world has already been composited; the veil reads as the
    // light going out of the scene).
    var q = deathSmooth(0.45, 1.5, deathPhaseT);
    if (q > 0.01) {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,' + (0.62 * q).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(30,38,48,' + (0.11 * q).toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    var v = 0.5 * deathSmooth(0.3, 1.4, deathPhaseT);
    if (v > 0.01) {
      var vignette = ctx.createRadialGradient(viewW / 2, viewH * 0.5, viewW * 0.2, viewW / 2, viewH * 0.5, viewW * 0.78);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,' + v.toFixed(3) + ')');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    // Phase 2: drop the plate the full playfield with cubic ease-out +
    // landing bounce. It locks onto the console's top edge.
    var P = deathPlateRect();
    var slideT = 0;
    var slideEased = 0;
    if (deathPhaseT > DEATH_PRE_PLATE_S) {
      slideT = Math.min(1, (deathPhaseT - DEATH_PRE_PLATE_S) / DEATH_PLATE_SLIDE_S);
      slideEased = 1 - Math.pow(1 - slideT, 3);
    }
    // Landing bounce: damped sine once the plate is fully down
    var bounce = 0;
    if (slideT >= 1) {
      if (deathLandedAt < 0) {
        deathLandedAt = deathPhaseT;
        // The kachunk (silent until assets/sfx lands the key, like all sfx)
        if (typeof sfxPlay === 'function') sfxPlay('land-hard', { gain: 0.9 });
        // Sparks spray along the console contact line
        for (var sp = 0; sp < 34; sp++) {
          deathSparks.push({
            x: P.x + Math.random() * P.w,
            y: P.h - 2,
            vx: (Math.random() - 0.5) * 8,
            vy: -1 - Math.random() * 3.5,
            t: 0.45 + Math.random() * 0.55,
            color: Math.random() > 0.5 ? '#ffd060' : '#ff8030',
            size: 1 + Math.floor(Math.random() * 2)
          });
        }
      }
      var bT = (deathPhaseT - deathLandedAt) / DEATH_BOUNCE_S;
      if (bT < 1) {
        bounce = 18 * Math.exp(-bT * 5) * Math.sin(bT * 18);
      }
    }
    deathPlateY = -P.h + Math.floor(P.h * slideEased + bounce);
    var py = deathPlateY, pw = P.w, ph = P.h;
    // Shake: landing impact + a smaller impulse when the stamp slams
    var shakeX = 0, shakeY = 0;
    if (slideT >= 1) {
      var shakeT = (deathPhaseT - deathLandedAt) / 0.25;
      if (shakeT < 1) {
        var shakeAmp = 6 * (1 - shakeT);
        shakeX = (Math.random() - 0.5) * shakeAmp;
        shakeY = (Math.random() - 0.5) * shakeAmp;
      }
    }
    if (deathStampAt >= 0) {
      var stT = (deathPhaseT - deathStampAt) / 0.2;
      if (stT < 1) {
        var stAmp = 4 * (1 - stT);
        shakeX += (Math.random() - 0.5) * stAmp;
        shakeY += (Math.random() - 0.5) * stAmp;
      }
    }

    // Clip to the playfield so the bounce dips BEHIND the console (the
    // console was painted earlier in the frame and must stay in front).
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, viewW, P.h);
    ctx.clip();
    if (shakeX || shakeY) ctx.translate(shakeX, shakeY);

    drawDeathPlateBody(0, py, pw, ph);

    // ---- SALVAGE MANIFEST, bolted to the plate ----
    var tc = deathPhaseT - deathContentT0();
    var m = deathManifest;
    if (tc > -0.1 && m) {
      var rowsAll = m.visLines.length;
      var fw = Math.min(400, Math.floor(pw * 0.46));
      // v25.63 — on a narrow portrait phone pw*0.46 is tiny, so the old
      // min(280,...) fallback left a cramped paper the scale-2 summary rows
      // overflowed. Give the receipt most of the available width so those rows
      // fit at their authored size (the row helper still guards the rest).
      if (fw < 320) fw = Math.min(340, pw - 24);
      var fh = Math.min(ph - 100, 272 + rowsAll * 22 + 24);
      var fx = Math.round((pw - fw) / 2);
      var fy = py + Math.floor((ph - fh) / 2) - 12;
      drawDeathPaper(fx, fy, fw, fh);
      drawBrassBolt(fx + 7, fy + 7);
      drawBrassBolt(fx + fw - 8, fy + 7);
      drawBrassBolt(fx + 7, fy + fh - 8);
      drawBrassBolt(fx + fw - 8, fy + fh - 8);

      var hx = fx + 24;
      var ly = fy + 18;
      drawStencilText('SALVAGE MANIFEST', hx, ly, 2, DEATH_INK);
      drawStencilText('RIG SL-1 · ' + m.depth + ' M · NO. ' + m.noStr, hx, ly + 20, 1, DEATH_INK_DIM);
      ctx.fillStyle = DEATH_INK_DIM;
      ctx.fillRect(hx, ly + 34, fw - 48, 2);
      ly += 48;

      // Cargo lines cascade in; each value counts up as it prints. Sound
      // rides the sell-reveal grammar (sell-tick pitch climb), real-time
      // crossings only so a skip-tap doesn't machine-gun the bus.
      for (var i = 0; i < rowsAll; i++) {
        var st = 0.35 + i * 0.42;
        if (tc >= st && tc - dt < st && tc - st < 0.25 && typeof sfxPlay === 'function') {
          sfxPlay('sell-tick', { rate: 1 + 0.05 * i, gain: 0.6 });
        }
        if (tc >= st) {
          var line = m.visLines[i];
          ctx.fillStyle = line.chip;
          ctx.fillRect(hx - 10, ly, 6, 6);
          drawStencilText(line.label, hx, ly, 1, DEATH_INK);
          var vNum = deathOdo(tc, st, 0.45, line.value);
          var vStr = '$' + vNum.toLocaleString();
          var vX = fx + fw - 20 - stencilTextWidth(vStr, 1);
          drawStencilText(vStr, vX, ly, 1, DEATH_INK);
          // dot leaders between label and value
          ctx.fillStyle = DEATH_INK_DIM;
          for (var dd = hx + stencilTextWidth(line.label, 1) + 8; dd < vX - 8; dd += 6) {
            ctx.fillRect(dd, ly + 5, 2, 1);
          }
        }
        ly += 22;
      }
      var afterLines = 0.35 + rowsAll * 0.42;

      // Total forfeit
      if (tc >= afterLines) {
        ctx.fillStyle = DEATH_INK_DIM;
        ctx.fillRect(hx, ly - 4, fw - 48, 1);
        var tStr2 = '$' + deathOdo(tc, afterLines, 0.6, m.total).toLocaleString();
        drawDeathSummaryRow('CARGO FORFEIT', tStr2, hx, fx + fw - 20, ly + 4, 2, DEATH_RED_DARK, DEATH_RED_DARK);
      }
      ly += 30;
      // Balance on record
      if (tc >= afterLines + 0.75) {
        drawStencilText('BALANCE: $' + m.balance.toLocaleString(), hx, ly + 4, 1, DEATH_INK_DIM);
      }
      ly += 18;
      // The levy counts DOWN in red
      var levyAt = afterLines + 1.15;
      if (tc >= levyAt) {
        var lvStr = '-$' + deathOdo(tc, levyAt, 0.8, m.fee).toLocaleString();
        drawDeathSummaryRow('SALVAGE LEVY 10%', lvStr, hx, fx + fw - 20, ly + 4, 2, DEATH_RED, DEATH_RED);
      }
      ly += 28;
      // Remittance
      var remitAt = levyAt + 0.85;
      if (tc >= remitAt && tc - dt < remitAt && tc - remitAt < 0.25 && typeof sfxPlay === 'function') {
        sfxPlay('sell-total');
      }
      if (tc >= remitAt) {
        ctx.fillStyle = DEATH_INK;
        ctx.fillRect(hx, ly - 4, fw - 48, 2);
        var rStr = '$' + m.remitted.toLocaleString();
        drawDeathSummaryRow('REMITTED', rStr, hx, fx + fw - 20, ly + 6, 2, DEATH_INK, DEATH_INK);
      }
      ly += 36;
      // SETTLED stamp in its own clear zone below the totals
      drawDeathStamp('SETTLED', fx + fw - 118, ly + 26, remitAt + 0.45, tc);
      // Ministry advisory at the paper's foot
      if (tc >= remitAt + 0.5) {
        drawStencilText('"' + m.flavor + '"', hx, fy + fh - 24, 1, DEATH_INK_DIM);
      }
    }

    // Prompt + save-contract line, stenciled on the plate's bottom panel
    var endT = deathRevealEndT();
    if (deathPhaseT >= endT + 0.25) {
      var savedStr = 'PROGRESS SAVED';
      drawStencilText(savedStr, Math.floor((pw - stencilTextWidth(savedStr, 1)) / 2), py + ph - 62, 1, 'rgba(216,210,196,0.55)');
      var hintStr = (isMobile ? 'TAP' : 'CLICK') + ' ▸ RETURN TO TOWN';
      var hintPulse = 0.62 + 0.38 * Math.sin((deathPhaseT - endT) * 3.2);
      drawStencilText(hintStr, Math.floor((pw - stencilTextWidth(hintStr, 2)) / 2), py + ph - 42, 2, 'rgba(212,168,56,' + hintPulse.toFixed(3) + ')');
    }

    ctx.restore();   // pop the clip (+ shake)

    // ---- Spark particles (on top of the plate, unclipped) ----
    for (var pix = deathSparks.length - 1; pix >= 0; pix--) {
      var sk = deathSparks[pix];
      sk.x += sk.vx;
      sk.y += sk.vy;
      sk.vy += 0.35;
      sk.t -= dt;
      if (sk.t <= 0) { deathSparks.splice(pix, 1); continue; }
      ctx.fillStyle = sk.color;
      ctx.globalAlpha = Math.min(1, sk.t * 2);
      ctx.fillRect(sk.x, sk.y, sk.size, sk.size);
      ctx.fillStyle = '#fff0c0';
      ctx.fillRect(sk.x, sk.y, 1, 1);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawShopFloor() {
    if (!UI_NEW || shopState === 'closed') return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    if (USE_NEW_SHOP_UI) {
      // v26.18 — the UI kit paints its own fizzed-world backdrop (blur +
      // dim + vignette over the playfield only, console untouched); the
      // old flat dim would double-darken it. The board page fills opaque.
      newShopDraw();
    } else {
      // Legacy walk-up shop: camera-push dim over the playfield, NOT the
      // console (v11.26: the toolbar must stay fully lit while shopping).
      var ch = consoleHeight();
      var roomBottom = viewH - ch;
      var dim = 0.62 * (shopEnterT < 1 ? shopEnterT : 1);
      ctx.fillStyle = 'rgba(0,0,0,' + dim.toFixed(3) + ')';
      ctx.fillRect(0, 0, viewW, roomBottom);
      if (shopState === 'floor') drawShopRoom();
      else drawShopSubPage();
    }
    ctx.restore();
  }

  // Pointer dispatch for shop interior. Floor: hit-test station rects; click
  // pushes shopState. Sub-page: hit-test back-arrow only; click pops to
  // 'floor'. Returns true if the shop consumed the input.
  function handleShopInteriorPointerDown(x, y, id) {
    if (USE_NEW_SHOP_UI) return newShopPointerDown(x, y, id);
    if (shopState === 'floor') {
      // LEAVE SHOP button — places the rig down on the deck between the
      // shop and the fireplace, clears all velocity so the player can
      // start fresh. Also closes the door immediately.
      var lb = shopLeaveBtnRect();
      if (x >= lb.x && x <= lb.x + lb.w && y >= lb.y && y <= lb.y + lb.h) {
        shopState = 'closed';
        shopDoorT = 0;
        if (typeof player !== 'undefined' && player) {
          // Spawn between shop and fireplace. Shop center = stationCenterCol
          // * TILE + TILE/2; fireplace is +150 from that. Halfway is +75.
          var stationCx = nearestTownStationCol() * TILE + TILE / 2;
          player.x = stationCx + 75 - PLAYER_W / 2;
          player.y = DECK_ROW * TILE - PLAYER_H;
          player.vx = 0; player.vy = 0;
          player.thrusting = false;
          if (typeof player.thrustSpool !== 'undefined') player.thrustSpool = 0;
          if (typeof player.dir !== 'undefined') player.dir = 1;
          if (typeof player.renderX !== 'undefined') { player.renderX = player.x; player.renderY = player.y; }
        }
        return true;
      }
      var rects = shopStationRects();
      var ids = ['workshop', 'shelf', 'board'];
      for (var i = 0; i < ids.length; i++) {
        var st = rects[ids[i]];
        if (x >= st.x && x <= st.x + st.w && y >= st.y && y <= st.y + st.h) {
          shopState = st.id;
          // Reset entrance animations so each push plays the intro
          if (st.id === 'shelf') shopShelfModalEnterT = 0;
          if (st.id === 'workshop') shopWorkshopModalEnterT = 0;
          return true;
        }
      }
      return true;   // click on shop floor, not on a station — eat it
    } else {
      var b = shopBackArrowRect();
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        shopState = 'floor';
        return true;
      }
      // SHELF sub-page BUY levers
      if (shopState === 'shelf' && SHELF_BUY_RECTS && SHELF_BUY_RECTS.length) {
        for (var bi = 0; bi < SHELF_BUY_RECTS.length; bi++) {
          var br = SHELF_BUY_RECTS[bi];
          if (x >= br.x && x <= br.x + br.w && y >= br.y && y <= br.y + br.h) {
            var moneyBefore = money;
            buildShopItems();
            var item = null;
            for (var si = 0; si < shopItems.length; si++) {
              if (shopItems[si].key === br.key) { item = shopItems[si]; break; }
            }
            if (item) buyUpgrade(item);
            var success = (money < moneyBefore) || (devMode && item);
            fireShelfBuyFx(br, success);
            return true;
          }
        }
      }
      // WORKSHOP sub-page BUY buttons
      if (shopState === 'workshop' && WORKSHOP_BUY_RECTS && WORKSHOP_BUY_RECTS.length) {
        for (var wbi = 0; wbi < WORKSHOP_BUY_RECTS.length; wbi++) {
          var wbr = WORKSHOP_BUY_RECTS[wbi];
          if (x >= wbr.x && x <= wbr.x + wbr.w && y >= wbr.y && y <= wbr.y + wbr.h) {
            if (!wbr.canBuy) {
              fireWorkshopBuyFx(wbr, false);
              return true;
            }
            var moneyBefore2 = money;
            buildShopItems();
            var item2 = null;
            for (var si2 = 0; si2 < shopItems.length; si2++) {
              if (shopItems[si2].key === wbr.key) { item2 = shopItems[si2]; break; }
            }
            if (item2) buyUpgrade(item2);
            var success2 = (money < moneyBefore2) || (devMode && item2);
            fireWorkshopBuyFx(wbr, success2);
            return true;
          }
        }
      }
      return true;   // sub-page eats clicks elsewhere too
    }
  }
  function updateShopHover(x, y) {
    if (USE_NEW_SHOP_UI) { newShopPointerMove(x, y); return; }
    if (shopState === 'floor') {
      shopHoverShelfItem = null;
      var ids = ['leave', 'workshop', 'shelf', 'board'];
      var newHover = null;
      for (var i = 0; i < ids.length; i++) {
        var hr = shopWorkAreaRect(ids[i]);
        if (x >= hr.x && x <= hr.x + hr.w && y >= hr.y && y <= hr.y + hr.h) {
          newHover = ids[i]; break;
        }
      }
      shopHoverStation = newHover;
    } else if (shopState === 'shelf') {
      shopHoverStation = null;
      shopHoverWorkshopItem = null;
      var newHover2 = null;
      for (var j = 0; j < SHELF_BUY_RECTS.length; j++) {
        var br = SHELF_BUY_RECTS[j];
        if (x >= br.x && x <= br.x + br.w && y >= br.y && y <= br.y + br.h) {
          newHover2 = br.key; break;
        }
      }
      shopHoverShelfItem = newHover2;
    } else if (shopState === 'workshop') {
      shopHoverStation = null;
      shopHoverShelfItem = null;
      var newHover3 = null;
      for (var k = 0; k < WORKSHOP_BUY_RECTS.length; k++) {
        var wbr2 = WORKSHOP_BUY_RECTS[k];
        if (x >= wbr2.x && x <= wbr2.x + wbr2.w && y >= wbr2.y && y <= wbr2.y + wbr2.h) {
          newHover3 = wbr2.key; break;
        }
      }
      shopHoverWorkshopItem = newHover3;
    } else {
      shopHoverStation = null;
      shopHoverShelfItem = null;
      shopHoverWorkshopItem = null;
    }
  }

