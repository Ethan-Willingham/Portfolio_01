  /* ================================================================
     ONBOARDING RADIO (057): the first five minutes
     ================================================================
     A diegetic radio tutorial from the KOMENDATURA quartermaster: one
     line at a time in a small radio panel top-center, no modals, no
     pauses, pure state-polling. Each step shows its line until its
     exit condition fires, then a 1s gap of silence, then the next.
     Voice: dry Soviet quartermaster, warm under the gruff.

     Wiring (done in the main session): onboardingTick(dt) runs every
     frame from the game loop (350); drawOnboarding() is dispatched in
     the screen-space UI overlay after the HUD (140).

     Persistence: tutorialDone rides in profile.tutorialDone (047,
     saveBuild/saveApply/saveWipe, same additive pattern as
     ledgerData/seamComplete). The var itself is declared HERE.
     Dev escape hatch: localStorage 'sluice.opt.skipintro' = '1'
     disables the whole system at boot.
     ================================================================ */

  var tutorialDone = false;   // persisted via profile.tutorialDone (047)

  // Read the skip-intro opt once at boot; localStorage can throw in
  // some privacy modes, so the whole read is fenced.
  var ONBOARD_SKIP = false;
  try { ONBOARD_SKIP = (localStorage.getItem('sluice.opt.skipintro') === '1'); } catch (e) {}

  var onboardState = {
    step: 0,          // 0..5, see the step machine below
    lineT: 0,         // seconds the CURRENT displayed line has been up (drives type-on)
    done: false,      // finished or ESC-dismissed; panel never returns this run
    dismissT: 0,      // short fade-out after done

    started: false,   // boot delay elapsed, radio is live
    bootT: 0,         // boot-delay accumulator (~1s of quiet before step 0)
    stepT: 0,         // seconds in the current step (timeout exits)
    inGap: false,     // 1s of radio silence between lines
    gapT: 0,
    panelA: 0,        // panel fade/slide 0..1 (200ms per new line)
    clock: 0,         // free-running clock for the blinking diamond
    lastLine: '',     // change detector; new text restarts type-on + slide-in
    fuelWarned: false,// the low-fuel interject fires once per run
    fuelT: 0,         // interject countdown; while > 0 it overrides the step line
  };

  // ----- Script (all lines < 90 chars, no em dashes) -----
  var ONBOARD_LINES = [
    'Rig\'s fueled. First seam is ten meters down. Try not to embarrass us.',
    '',  // step 1 is input-aware, resolved in onboardingLineFor()
    'Good. Coal burns, coal pays. Deeper is richer.',
    'That\'s a haul. Bring it home, the pad pays cash.',
    'Paid. The shop is the tall door. Spend it on the rig, not vodka.',
    'You\'re a miner now. The frontier is west. Earn your way to it.',
  ];
  var ONBOARD_LINE_KB    = 'Hold a direction into the dirt. The drill does the rest.';
  var ONBOARD_LINE_TOUCH = 'D-pad into the dirt. The drill does the rest.';
  var ONBOARD_LINE_FUEL  = 'Watch the fuel needle. Dead engine, dead miner.';

  function onboardingLineFor(step) {
    if (step === 1) return isMobile ? ONBOARD_LINE_TOUCH : ONBOARD_LINE_KB;
    return ONBOARD_LINES[step] || '';
  }

  // The line the panel should be showing right now ('' = silence).
  function onboardingCurrentLine() {
    if (!onboardState.started) return '';
    if (onboardState.fuelT > 0) return ONBOARD_LINE_FUEL;
    if (onboardState.inGap) return '';
    return onboardingLineFor(onboardState.step);
  }

  // Is any shop surface up? Mirrors the input handler's shopUp check so
  // ESC keeps closing the shop instead of silencing the radio.
  function onboardingShopUp() {
    return (UI_NEW && shopState !== 'closed') || shopOpen;
  }

  function onboardingFinish() {
    onboardState.done = true;
    onboardState.dismissT = 0.25;
    tutorialDone = true;   // persists at the next autosave (047)
  }

  function onboardingTick(dt) {
    var st = onboardState;
    if (st.done) {
      if (st.dismissT > 0) st.dismissT -= dt;
      // Pause-screen Restart wipes the save (saveWipe resets tutorialDone)
      // without reloading the page, so re-arm for the fresh run. A normal
      // finish/dismiss always sets tutorialDone, so this only fires post-wipe.
      if (!tutorialDone && st.dismissT <= 0) {
        st.step = 0; st.lineT = 0; st.done = false; st.dismissT = 0;
        st.started = false; st.bootT = 0; st.stepT = 0;
        st.inGap = false; st.gapT = 0; st.panelA = 0;
        st.lastLine = ''; st.fuelWarned = false; st.fuelT = 0;
      }
      return;
    }
    if (tutorialDone || ONBOARD_SKIP) { st.done = true; return; }
    if (gameOver) return;   // freeze; death plate owns the screen

    st.clock += dt;

    // Boot delay: ~1s of quiet before the quartermaster keys the mic.
    if (!st.started) {
      st.bootT += dt;
      if (st.bootT < 1) return;
      st.started = true;
    }

    // Low-fuel interject (any step, once): overrides the line for 5s.
    if (st.fuelT > 0) st.fuelT -= dt;
    if (!st.fuelWarned && maxFuel > 0 && player.fuel / maxFuel < 0.5) {
      st.fuelWarned = true;
      st.fuelT = 5;
    }

    // ----- Step machine -----
    if (st.inGap) {
      st.gapT -= dt;
      if (st.gapT <= 0) {
        st.inGap = false;
        st.step++;
        st.stepT = 0;
      }
    } else {
      st.stepT += dt;
      var exit = false;
      switch (st.step) {
        case 0:   // boot line: exits on first movement input, any drill, or 8s
          exit = hasDrilledOnce || st.stepT >= 8 ||
                 (st.stepT > 0.5 && (Math.abs(player.vx) > 5 || Math.abs(player.vy) > 5));
          break;
        case 1:   // movement/drill hint: exits on the first completed drill
          exit = hasDrilledOnce;
          break;
        case 2:   // first drill done: exits at 3 cargo or 45s
          exit = cargo.length >= 3 || st.stepT >= 45;
          break;
        case 3:   // haul in the bay: exits on first cash
          exit = money > 0;
          break;
        case 4:   // paid: exits when the shop is first opened, or 60s
          exit = onboardingShopUp() || st.stepT >= 60;
          break;
        case 5:   // sign-off: shows 6s, then done
          if (st.stepT >= 6) { onboardingFinish(); return; }
          break;
      }
      if (exit) { st.inGap = true; st.gapT = 1; }
    }

    // ----- Display bookkeeping (type-on + slide/fade per new line) -----
    var line = onboardingCurrentLine();
    if (line !== st.lastLine) {
      st.lastLine = line;
      st.lineT = 0;
      if (line) st.panelA = 0;   // new line: restart the 200ms slide-in
    }
    if (line) {
      st.lineT += dt;
      st.panelA = Math.min(1, st.panelA + dt / 0.2);
    } else {
      st.panelA = Math.max(0, st.panelA - dt / 0.15);
    }
  }

  // ----- ESC dismiss -----
  // The pause toggle in setupInput (050) CONSUMES Escape on keydown when no
  // shop is up, so polling keys['Escape'] in the tick never sees it. Instead
  // we register our own capture-phase listener; this fragment evaluates
  // before boot calls setupInput, so we run first either way. While a
  // tutorial line is visible (and no shop owns ESC) the key silences the
  // radio for good (a player who dismisses doesn't want it again) and we
  // stop propagation so the same press doesn't also flicker the pause screen.
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || e.repeat) return;
    var st = onboardState;
    if (st.done || tutorialDone || !st.started) return;
    if (!onboardingCurrentLine() || st.panelA <= 0) return;   // nothing on screen
    if (onboardingShopUp()) return;   // shop owns ESC
    if (gamePaused) return;           // pause overlay owns ESC
    onboardingFinish();
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);

  // ----- Render: compact radio panel, top-center, under the layer banner -----
  // Screen-space CSS px (same transform as drawHUD / drawNmzExitArrow).
  // Dark steel plate, 1px caution-gold border, blinking radio diamond,
  // KOMENDATURA micro-label, type-on mono line. Total height ~40 CSS px.
  function drawOnboarding() {
    var st = onboardState;
    if (gameOver) return;
    var a = st.panelA;
    if (st.done) {
      if (st.dismissT <= 0) return;
      a *= Math.max(0, st.dismissT / 0.25);
    }
    if (a <= 0) return;
    var line = st.lastLine;
    if (!line) return;

    // Type-on at ~40 chars/sec; panel width sized from the FULL line so the
    // plate doesn't grow while the text types.
    var shown = line.substr(0, Math.floor(st.lineT * 40));

    var escTag = !isMobile && !st.done;
    var padL = 12, padR = escTag ? 44 : 12;
    var maxPanelW = Math.min(viewW - 16, 560);

    var fontPx = 12;
    ctx.save();
    ctx.font = 'bold ' + fontPx + 'px ' + UI_FONT;
    var lineW = ctx.measureText(line).width;
    var availW = maxPanelW - padL - padR;
    if (lineW > availW) {   // narrow screens: shrink the type, never clip
      fontPx = Math.max(9, Math.floor(fontPx * availW / lineW));
      ctx.font = 'bold ' + fontPx + 'px ' + UI_FONT;
      lineW = ctx.measureText(line).width;
    }

    var panelW = Math.min(maxPanelW, Math.max(lineW, 150) + padL + padR);
    var panelH = 40;
    var hudH = isMobile ? 104 : 60;   // matches drawHUD / drawLayerBanner sizing
    var panelX = Math.round((viewW - panelW) / 2);
    var panelY = Math.round(hudH + 10 + (a - 1) * 6);   // slides down 6px as it fades in

    ctx.globalAlpha = a * 0.92;

    // Plate + caution-gold border
    ctx.fillStyle = 'rgba(10,12,17,0.88)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 4, true);
    ctx.globalAlpha = a * 0.55;
    ctx.strokeStyle = BLD.goldBright;
    ctx.lineWidth = 1;
    roundRect(ctx, panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1, 4, false, true);

    // Blinking radio diamond + micro-label
    var dx = panelX + padL + 4, dy = panelY + 11;
    var blink = (st.clock % 1.0) < 0.55;
    ctx.globalAlpha = a * (blink ? 0.95 : 0.30);
    ctx.fillStyle = BLD.goldBright;
    ctx.beginPath();
    ctx.moveTo(dx, dy - 3.5); ctx.lineTo(dx + 3.5, dy);
    ctx.lineTo(dx, dy + 3.5); ctx.lineTo(dx - 3.5, dy);
    ctx.closePath(); ctx.fill();

    ctx.globalAlpha = a * 0.75;
    ctx.fillStyle = BLD.goldPale;
    ctx.font = 'bold 8px ' + UI_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('KOMENDATURA', dx + 9, dy + 0.5);

    // ESC dismiss tag, top-right corner (keyboard only)
    if (escTag) {
      ctx.font = 'bold 7px ' + UI_FONT;
      var tw = ctx.measureText('ESC').width + 8;
      var tx = panelX + panelW - tw - 7, ty = panelY + 6, th = 11;
      ctx.globalAlpha = a * 0.35;
      ctx.strokeStyle = BLD.goldPale;
      roundRect(ctx, tx, ty, tw, th, 2, false, true);
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = BLD.goldPale;
      ctx.fillText('ESC', tx + 4, ty + th / 2 + 0.5);
    }

    // The line itself, typing on
    ctx.globalAlpha = a * 0.95;
    ctx.fillStyle = 'rgba(232,227,213,0.96)';
    ctx.font = 'bold ' + fontPx + 'px ' + UI_FONT;
    ctx.fillText(shown, panelX + padL, panelY + 27.5);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
