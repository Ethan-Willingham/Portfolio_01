  /* ================================================================
     RADIO MESSAGES (058): brief feedback, one plate at a time
     ================================================================
     showMsg(text, alert, opts) routes here from 060. Full text appears
     immediately, then clears itself after 1.8-3s (routine) or 2.8-4s
     (warning). Repeated warnings never rewind the timer and get a
     quiet interval before they can return.

     The latest event replaces routine feedback. Warnings interrupt
     immediately; at most one routine line waits behind a warning,
     and it expires if it is no longer fresh. opts.key coalesces a
     channel, opts.dur pins a prompt to its action's exact time window.
     No alert backlog and no stack with the tutorial plate (057).

     Both radio surfaces share the wrapped, fixed-size text renderer
     below. Tick runs in 350 even in the shop; init resets this state.
     ================================================================ */

  var radioMsg = {
    cur: null,      // showing line: {text, alert, tag, key, dur, t, expiresAt}
    queue: [],      // at most the latest routine feedback behind a warning
    recent: [],     // bounded repeat suppression, measured in play seconds
    show: null,     // last shown line, kept for fade-out
    panelA: 0,
    clock: 0,
    gapT: 0,
    y: 0,
  };

  function radioMsgDuration(text, alert, dur) {
    if (typeof dur === 'number' && isFinite(dur) && dur > 0) return dur;
    return Math.min(alert ? 4 : 3,
      Math.max(alert ? 2.8 : 1.8, 1.1 + text.length * 0.024));
  }

  function radioMsgStart(m) {
    var st = radioMsg;
    m.t = 0;
    // Explicit prompts age from the event, including any waiting time.
    if (m.exact) m.dur = Math.max(0, m.expiresAt - st.clock);
    st.cur = m;
    st.show = m;
    st.gapT = 0;
  }

  function radioMsgPush(text, alert, opts) {
    if (!text || gameOver) return;
    opts = opts || {};
    var st = radioMsg;
    var key = opts.key || null;
    var exact = typeof opts.dur === 'number' && isFinite(opts.dur) && opts.dur > 0;
    // Ignore case/punctuation so the two cargo-full callers share a cooldown.
    var id = text.toLowerCase().replace(/[.!]+$/, '');
    var cooldown = alert ? 10 : 5;
    if (!exact) {
      for (var i = 0; i < st.recent.length; i++) {
        var seen = st.recent[i];
        if (seen.id === id && (!alert || seen.alert) && st.clock - seen.at < cooldown) return;
      }
    }
    st.recent.push({ id: id, alert: !!alert, at: st.clock });
    if (st.recent.length > 32) st.recent.shift();
    var m = { text: text, alert: !!alert, tag: opts.tag || 'RIG', key: key,
      dur: radioMsgDuration(text, alert, opts.dur), exact: exact, t: 0,
      expiresAt: st.clock + (exact ? opts.dur : 3),
      deadline: performance.now() + radioMsgDuration(text, alert, opts.dur) * 1000 };

    // Keep the return-to-town confirmation visible for its action window.
    // Other feedback can wait briefly, but never restart or replace it.
    if (st.cur && st.cur.exact && !exact) {
      st.queue[0] = m;
      return;
    }
    // A real new event may update a showing channel; repeats above cannot
    // keep a warning pinned. Timed confirmations must appear immediately.
    if (!st.cur || !st.cur.alert || m.alert || exact) {
      st.queue.length = 0;
      radioMsgStart(m);
    } else {
      // Keep only the latest routine event, never a shopping backlog.
      st.queue[0] = m;
    }
  }

  // The prompted action was taken (second R press). Drop pending chatter too.
  function radioMsgCut() {
    radioMsg.cur = null;
    radioMsg.queue.length = 0;
    radioMsg.gapT = 0.2;
  }

  function radioMsgReset() {
    radioMsg.cur = null;
    radioMsg.queue.length = 0;
    radioMsg.recent.length = 0;
    radioMsg.show = null;
    radioMsg.panelA = 0;
    radioMsg.gapT = 0;
    radioMsg.clock = 0;
  }

  function radioMsgTick(dt) {
    var st = radioMsg;
    st.clock += dt;
    if (gameOver || gameWon || ledgerOpen || seamCreditsOn) {
      radioMsgCut();
      st.panelA = Math.max(0, st.panelA - dt / 0.15);
      return;
    }
    if (st.gapT > 0) st.gapT -= dt;
    if (st.queue.length && (st.queue[0].expiresAt <= st.clock ||
        st.queue[0].deadline <= performance.now())) st.queue.length = 0;
    if (!st.cur && st.queue.length && st.gapT <= 0) radioMsgStart(st.queue.shift());
    if (st.cur) {
      st.cur.t += dt;
      // Routine feedback also expires across a pause. Timed R prompts use
      // play time, matching restartConfirmT, which pauses with the game.
      if (st.cur.t >= st.cur.dur || (!st.cur.exact && performance.now() >= st.cur.deadline)) {
        if (st.cur.exact) { st.show = null; st.panelA = 0; }
        st.cur = null;
        st.gapT = 0.3;
      }
    }
    st.panelA = st.cur ? Math.min(1, st.panelA + dt / 0.15)
                       : Math.max(0, st.panelA - dt / 0.15);
    st.y = (isMobile ? 104 : 60) + 10;
  }

  // Fixed 12px text wraps instead of shrinking to illegible single lines.
  // Cache the layout: the same line is drawn every frame, on both surfaces.
  var radioLayoutCache = { text: null, width: 0, layout: null };
  function radioMsgLayout(text) {
    var maxW = Math.max(40, Math.min(viewW - 16, 560));
    if (radioLayoutCache.text === text && radioLayoutCache.width === viewW) return radioLayoutCache.layout;
    var pad = 12, fontPx = 12, lineH = 16, avail = maxW - pad * 2;
    ctx.save();
    ctx.font = 'bold ' + fontPx + 'px ' + UI_FONT;
    var words = text.split(/\s+/), lines = [], line = '', widest = 0;
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > avail) { lines.push(line); line = ''; }
      // Break a long unspaced identifier too, so no glyph leaves the plate.
      while (ctx.measureText(word).width > avail && word.length > 1) {
        var n = word.length - 1;
        while (n > 1 && ctx.measureText(word.substr(0, n)).width > avail) n--;
        lines.push(word.substr(0, n));
        word = word.substr(n);
      }
      line = line ? line + ' ' + word : word;
    }
    if (line) lines.push(line);
    for (var j = 0; j < lines.length; j++) widest = Math.max(widest, ctx.measureText(lines[j]).width);
    ctx.restore();
    var w = Math.min(maxW, Math.max(150, Math.ceil(widest)) + pad * 2);
    var layout = { x: Math.round((viewW - w) / 2), w: w,
      h: 40 + Math.max(0, lines.length - 1) * lineH,
      lines: lines, fontPx: fontPx, lineH: lineH, pad: pad };
    radioLayoutCache = { text: text, width: viewW, layout: layout };
    return layout;
  }

  function drawRadioPlate(text, tag, alert, a, y, layout) {
    var l = layout || radioMsgLayout(text);
    var x = l.x, top = Math.round(y + (a - 1) * 4);
    var lampCol = alert ? '#ffb030' : BLD.goldBright;
    ctx.save();
    ctx.globalAlpha = a * 0.96;
    ctx.fillStyle = UIT_INSET;
    roundRect(ctx, x, top, l.w, l.h, 4, true);
    ctx.globalAlpha = a * 0.55;
    ctx.strokeStyle = lampCol;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, top + 0.5, l.w - 1, l.h - 1, 4, false, true);

    // A steady carrier lamp keeps brief feedback quiet and easy to scan.
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = lampCol;
    ctx.fillRect(x + l.pad, top + 9, 4, 4);
    ctx.fillStyle = UIT_BODY;
    ctx.font = 'bold 8px ' + UI_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag || 'RIG', x + l.pad + 10, top + 11);
    ctx.globalAlpha = a;
    ctx.fillStyle = UIT_TEXT;
    ctx.font = 'bold ' + l.fontPx + 'px ' + UI_FONT;
    for (var i = 0; i < l.lines.length; i++) {
      ctx.fillText(l.lines[i], x + l.pad, top + 27 + i * l.lineH);
    }
    ctx.restore();
  }

  function drawRadioMsg() {
    if (!UI_NEW || gameOver || gameWon || gamePaused || ledgerOpen || seamCreditsOn) return;
    var st = radioMsg;
    var m = st.cur || st.show;
    if (st.panelA <= 0 || !m) return;
    drawRadioPlate(m.text, m.tag, m.alert, st.panelA, st.y, radioMsgLayout(m.text));
  }

  window.__radioMsg = {
    push: radioMsgPush,
    cut: radioMsgCut,
    reset: radioMsgReset,
    tick: radioMsgTick,
    draw: drawRadioMsg,
    st: radioMsg,
  };
