  /* ================================================================
     RADIO MESSAGES (058): the general comms channel
     ================================================================
     showMsg() finally has a surface that renders under UI_NEW. Before
     this fragment every showMsg call was a visual no-op (the only
     renderer was the !UI_NEW pill in 140, and UI_NEW is permanently
     true), so "Press R again", "Need $X", "OUT OF FUEL" never reached
     the player. This is the fix: the same diegetic grammar as the
     onboarding radio above (057). One small dark steel plate,
     top-center, lamp-coloured border, blinking carrier diamond,
     type-on mono line. No floating text, no toasts (UI_STYLE.md
     section 2 axis 4 + section 10): every glyph lives on this plate.

     Routing: showMsg(text, alert, opts) in 060 calls radioMsgPush.
     alert=true lines are caution-grade per UI_STYLE section 6: amber
     lamp colour, hard 1 Hz blink (section 4.3), they jump the queue,
     cut routine chatter mid-read, and hold longer. Routine lines run
     FIFO with a beat of radio silence between them. Glyphs stay
     stencil-paint off-white in both cases (section 7.5: signal colour
     belongs to the lamp + border, never the letterforms).

     Queue rules (rapid-fire purchases, repeating CARGO FULL):
       1. same text as the showing line: refresh its hold, no re-type
       2. same opts.key as the showing line: swap the text in place
          (purchase lines share key 'buy', so buying five items reads
          as one live line, not a 15-second backlog)
       3. same text or key waiting in the queue: replaced in place
       4. queue caps at 4 (oldest routine line drops first) and a
          routine line that waited 10s+ behind alerts drops as stale
     opts.dur pins the TOTAL on-screen time to a game timer (the
     R-confirm line matches restartConfirmT exactly).

     The plate stacks BELOW the onboarding plate while a tutorial line
     is up (both share the top-center slot). It hides during gameOver:
     the death plate owns the screen (UI_STYLE section 12.4) and
     pre-death chatter dies with the rig; the respawn line from 047
     arrives after gameOver clears, so it still reads.

     Wiring (mirrors 057): radioMsgTick(dt) runs from the loop (350,
     beside onboardingTick); drawRadioMsg() is dispatched in the
     screen-space UI overlay right after drawOnboarding (140), which
     puts it above the shop floor (purchase rejections stay readable)
     and below the death plate. init() calls radioMsgReset() so no
     line leaks across runs. Debug: window.__radioMsg.
     ================================================================ */

  var RADIO_TYPE_CPS = 40;     // type-on speed, chars/sec (matches 057)

  var radioMsg = {
    cur: null,      // showing line: {text, alert, tag, key, dur, t, hold}
    queue: [],      // waiting lines, FIFO (alerts unshift to the front)
    show: null,     // last shown line, kept for the fade-out frames
    panelA: 0,      // plate fade/slide 0..1 (200ms in, 150ms out)
    clock: 0,       // free-running clock for the carrier-diamond blink
    gapT: 0,        // short radio silence between lines
    y: 0,           // eased plate Y (stacks under the onboarding plate)
  };

  // Hold time AFTER the type-on finishes. dur, when given, is the TOTAL
  // on-screen time (type + hold). Alerts read longer: the player must act.
  function radioMsgHold(text, alert, dur) {
    if (dur) return Math.max(0.8, dur - text.length / RADIO_TYPE_CPS);
    var hold = 1.0 + text.length * 0.04 + (alert ? 1.2 : 0);
    return Math.min(alert ? 6.0 : 4.5, Math.max(alert ? 3.2 : 2.0, hold));
  }

  function radioMsgPush(text, alert, opts) {
    if (!text) return;
    opts = opts || {};
    var st = radioMsg;
    var key = opts.key || null;
    // Coalesce: the same line is already up (CARGO FULL re-fires on a
    // 1.5s cooldown while bumping a full bay). Refresh its hold and
    // rewind a finished type-on to "just typed" instead of replaying.
    if (st.cur && st.cur.text === text) {
      st.cur.alert = st.cur.alert || !!alert;
      st.cur.hold = radioMsgHold(text, st.cur.alert, opts.dur || st.cur.dur);
      st.cur.t = Math.min(st.cur.t, text.length / RADIO_TYPE_CPS);
      return;
    }
    // Coalesce: same channel key showing (rapid purchases). Swap the
    // text in place, keep the typed progress, refresh the hold.
    if (key && st.cur && st.cur.key === key) {
      st.cur.text = text;
      st.cur.alert = !!alert;
      if (opts.tag) st.cur.tag = opts.tag;
      st.cur.dur = opts.dur || 0;
      st.cur.hold = radioMsgHold(text, st.cur.alert, st.cur.dur);
      st.cur.t = Math.min(st.cur.t, text.length / RADIO_TYPE_CPS);
      return;
    }
    // Coalesce: a waiting line with the same text or key is replaced.
    for (var i = 0; i < st.queue.length; i++) {
      var q = st.queue[i];
      if (q.text === text || (key && q.key === key)) {
        q.text = text;
        q.alert = q.alert || !!alert;
        if (opts.tag) q.tag = opts.tag;
        q.dur = opts.dur || q.dur;
        return;
      }
    }
    var m = { text: text, alert: !!alert, tag: opts.tag || 'RIG',
              key: key, dur: opts.dur || 0, waitT: 0, t: 0, hold: 0 };
    if (m.alert) {
      // Alerts jump the queue and cut routine chatter mid-read.
      st.queue.unshift(m);
      if (st.cur && !st.cur.alert) { st.cur = null; st.gapT = 0; }
    } else {
      st.queue.push(m);
      if (st.queue.length > 4) {
        for (var j = 0; j < st.queue.length; j++) {
          if (!st.queue[j].alert) { st.queue.splice(j, 1); break; }
        }
        if (st.queue.length > 4) st.queue.shift();
      }
    }
  }

  // End the showing line right now because the action it prompted was
  // taken (e.g. the second R press). The next line follows after a beat.
  function radioMsgCut() {
    if (radioMsg.cur) { radioMsg.cur = null; radioMsg.gapT = 0.15; }
  }

  // Full clear for init() / new runs: no line survives a restart.
  function radioMsgReset() {
    radioMsg.cur = null;
    radioMsg.queue.length = 0;
    radioMsg.show = null;
    radioMsg.panelA = 0;
    radioMsg.gapT = 0;
  }

  function radioMsgTick(dt) {
    var st = radioMsg;
    st.clock += dt;
    if (gameOver) {
      // Death plate owns the screen; pre-death chatter dies with the rig.
      st.cur = null;
      st.queue.length = 0;
      st.panelA = Math.max(0, st.panelA - dt / 0.15);
      return;
    }
    if (st.gapT > 0) st.gapT -= dt;
    // Routine lines go stale while waiting behind a long alert.
    for (var i = st.queue.length - 1; i >= 0; i--) {
      var q = st.queue[i];
      q.waitT += dt;
      if (!q.alert && q.waitT > 10) st.queue.splice(i, 1);
    }
    if (!st.cur && st.queue.length && st.gapT <= 0) {
      st.cur = st.queue.shift();
      st.cur.t = 0;
      st.cur.hold = radioMsgHold(st.cur.text, st.cur.alert, st.cur.dur);
      st.show = st.cur;
      st.panelA = 0;   // restart the slide-in for the new line
    }
    if (st.cur) {
      st.cur.t += dt;
      if (st.cur.t >= st.cur.text.length / RADIO_TYPE_CPS + st.cur.hold) {
        st.cur = null;
        st.gapT = 0.3;
      }
    }
    st.panelA = st.cur ? Math.min(1, st.panelA + dt / 0.2)
                       : Math.max(0, st.panelA - dt / 0.15);
    // Slot: top-center under the HUD band, same as the onboarding plate;
    // drop below it while a tutorial line is up (its plate is 40 tall).
    var hudH = isMobile ? 104 : 60;
    var baseY = hudH + 10;
    if (typeof onboardState !== 'undefined' && !tutorialDone &&
        !onboardState.done && onboardState.panelA > 0.01) baseY += 48;
    if (st.panelA <= 0.001) st.y = baseY;   // snap while invisible
    else st.y += (baseY - st.y) * Math.min(1, dt * 10);
  }

  // ----- Render: same plate grammar as drawOnboarding (057) -----
  // Screen-space CSS px (same transform as drawHUD). Dark steel plate,
  // 1px lamp-coloured border, blinking carrier diamond, channel
  // micro-label, type-on mono line. Height 40 CSS px.
  function drawRadioMsg() {
    if (!UI_NEW) return;    // the legacy pill renderer in 140 owns !UI_NEW
    var st = radioMsg;
    if (gameOver) return;
    var a = st.panelA;
    if (a <= 0) return;
    var m = st.cur || st.show;
    if (!m || !m.text) return;
    var line = m.text;
    var shown = st.cur ? line.substr(0, Math.floor(st.cur.t * RADIO_TYPE_CPS)) : line;

    var padL = 12, padR = 12;
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
    var panelX = Math.round((viewW - panelW) / 2);
    var panelY = Math.round(st.y + (a - 1) * 6);   // slides down 6px fading in

    // Caution amber for alerts, the 057 info-gold for routine lines.
    var lampCol = m.alert ? '#ffb030' : BLD.goldBright;

    // Plate + lamp-coloured border
    ctx.globalAlpha = a * 0.92;
    ctx.fillStyle = 'rgba(10,12,17,0.88)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 4, true);
    ctx.globalAlpha = a * 0.55;
    ctx.strokeStyle = lampCol;
    ctx.lineWidth = 1;
    roundRect(ctx, panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1, 4, false, true);

    // Carrier diamond: soft gold flicker for routine lines, hard 1 Hz
    // caution blink for alerts (UI_STYLE.md section 4.3).
    var dx = panelX + padL + 4, dy = panelY + 11;
    var blink = (st.clock % 1.0) < (m.alert ? 0.5 : 0.55);
    ctx.globalAlpha = a * (blink ? 0.95 : (m.alert ? 0.12 : 0.30));
    ctx.fillStyle = lampCol;
    ctx.beginPath();
    ctx.moveTo(dx, dy - 3.5); ctx.lineTo(dx + 3.5, dy);
    ctx.lineTo(dx, dy + 3.5); ctx.lineTo(dx - 3.5, dy);
    ctx.closePath(); ctx.fill();

    // Channel micro-label: who is talking (RIG systems, KOMENDATURA)
    ctx.globalAlpha = a * 0.75;
    ctx.fillStyle = BLD.goldPale;
    ctx.font = 'bold 8px ' + UI_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.tag || 'RIG', dx + 9, dy + 0.5);

    // The line itself, typing on
    ctx.globalAlpha = a * 0.95;
    ctx.fillStyle = 'rgba(232,227,213,0.96)';
    ctx.font = 'bold ' + fontPx + 'px ' + UI_FONT;
    ctx.fillText(shown, panelX + padL, panelY + 27.5);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Debug handle, same pattern as window.__sluiceSave / window.__gamepad.
  window.__radioMsg = {
    push: radioMsgPush,
    cut: radioMsgCut,
    reset: radioMsgReset,
    tick: radioMsgTick,
    draw: drawRadioMsg,
    st: radioMsg,
  };
