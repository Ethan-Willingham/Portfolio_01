  /* ================================================================
     ONBOARDING RADIO (057): three short, contextual tips
     ================================================================
     Controls, the first haul, then upgrades after the first sale.
     Each tip expires after four seconds, whether or not the player
     follows it. Conditions only decide when an unseen tip is useful.
     General radio messages own the same slot and take priority.

     Persistence: tutorialDone rides in profile.tutorialDone (047).
     localStorage 'sluice.opt.skipintro' = '1' disables tips at boot.
     Escape belongs to pause and never dismisses or advances a tip.
     ================================================================ */

  var tutorialDone = false;
  var ONBOARD_SKIP = false;
  try { ONBOARD_SKIP = (localStorage.getItem('sluice.opt.skipintro') === '1'); } catch (e) {}

  var ONBOARD_TIP_S = 4;
  var onboardState = {
    step: 0,
    done: false,
    started: false,
    bootT: 0,
    gapT: 0,
    lineT: 0,
    lineStartedAt: 0,
    panelA: 0,
    lastLine: '',
    earnedCash: false,
    visitedShop: false,
    runPlayer: null
  };

  function onboardingReset() {
    var st = onboardState;
    st.step = 0; st.done = false; st.started = false;
    st.bootT = 0; st.gapT = 0; st.lineT = 0; st.lineStartedAt = 0;
    st.panelA = 0; st.lastLine = '';
    st.earnedCash = false; st.visitedShop = false;
    st.runPlayer = player;
  }

  function onboardingLineFor(step) {
    var pad = typeof gpConnected !== 'undefined' && gpConnected;
    if (step === 0) {
      if (pad) return 'Stick / D-pad moves. Hold into dirt to drill; hold Up to fly.';
      if (isMobile) return 'D-pad moves. Hold into dirt to drill; hold Up to fly.';
      return 'WASD / arrows move. Hold into dirt to drill; hold Up to fly.';
    }
    if (step === 1) return 'Land on the surface fuel pad to sell ore and refuel automatically.';
    if (step === 2) {
      if (pad) return 'At the shop door, press Y for rig upgrades.';
      if (isMobile) return 'Tap the shop building for rig upgrades.';
      return 'At the shop door, press E for rig upgrades.';
    }
    return '';
  }

  function onboardingCurrentLine() {
    return onboardState.done ? '' : onboardState.lastLine;
  }

  function onboardingShopUp() {
    return (UI_NEW && shopState !== 'closed') || shopOpen;
  }

  function onboardingObscured() {
    return gameOver || gameWon || gamePaused || onboardingShopUp() ||
      (typeof ledgerOpen !== 'undefined' && ledgerOpen) ||
      (typeof seamCreditsActive === 'function' && seamCreditsActive()) ||
      (typeof bathMode !== 'undefined' && bathMode) ||
      (typeof introPhase !== 'undefined' && introPhase !== 'done');
  }

  function onboardingRadioBusy() {
    return typeof radioMsg !== 'undefined' &&
      (radioMsg.panelA > 0.01 || radioMsg.cur || radioMsg.queue.length > 0);
  }

  function onboardingFinish() {
    onboardState.done = true;
    onboardState.panelA = 0;
    onboardState.lastLine = '';
    tutorialDone = true;
  }

  function onboardingAdvance() {
    var st = onboardState;
    st.step++;
    st.lastLine = ''; st.lineT = 0; st.panelA = 0;
    st.gapT = 1.5;
    if (st.step >= 3) onboardingFinish();
  }

  function onboardingTick(dt) {
    var st = onboardState;
    // init() replaces the player object; respawn only moves the existing
    // one. New Game therefore resets even a partially finished tutorial.
    if (!tutorialDone && (st.runPlayer !== player || st.done)) onboardingReset();
    if (tutorialDone || ONBOARD_SKIP) {
      st.done = true; st.panelA = 0; st.lastLine = '';
      return;
    }

    if (money > 0) st.earnedCash = true;
    if (st.earnedCash && onboardingShopUp()) st.visitedShop = true;

    // Once a line starts, its clock keeps running behind other panels.
    // Wall time also expires it across pause, which stops the RAF loop.
    if (st.lastLine) {
      st.lineT = Math.max(st.lineT + dt, (performance.now() - st.lineStartedAt) / 1000);
      var answered = (st.step === 1 && st.earnedCash) || (st.step === 2 && st.visitedShop);
      if (st.lineT >= ONBOARD_TIP_S || answered) {
        onboardingAdvance();
      } else {
        st.panelA = Math.min(1, st.lineT / 0.15, (ONBOARD_TIP_S - st.lineT) / 0.2);
      }
      return;
    }

    // Skip a lesson the player has already used. Waiting never pins a
    // plate to the screen and never delays a more useful radio message.
    if ((st.step < 2 && st.earnedCash) || (st.step === 2 && st.visitedShop)) {
      onboardingAdvance();
      return;
    }
    st.gapT = Math.max(0, st.gapT - dt);
    if (st.gapT > 0 || onboardingObscured() || onboardingRadioBusy()) return;
    if (!st.started) {
      st.bootT += dt;
      if (st.bootT < 1) return;
      st.started = true;
    }
    if (st.step === 1 && cargo.length === 0) return;
    if (st.step === 2 && !st.earnedCash) return;

    st.lastLine = onboardingLineFor(st.step);
    st.lineT = 0;
    st.lineStartedAt = performance.now();
    st.panelA = 0;
  }

  // Shared plate layout wraps full-size text on narrow screens (058).
  // Only one radio panel is ever drawn, even during its fade-out.
  function drawOnboarding() {
    var st = onboardState;
    if (st.done || st.panelA <= 0 || !st.lastLine || onboardingObscured() || onboardingRadioBusy()) return;
    var layout = radioMsgLayout(st.lastLine);
    var y = (isMobile ? 104 : 60) + 10;
    drawRadioPlate(st.lastLine, 'TIP', false, st.panelA, y, layout);
  }
