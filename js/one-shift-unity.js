(function () {
  'use strict';
  if (window.location.hash.startsWith('#layout=')) {
    window.location.replace('one-shift-classic.html' + window.location.hash);
    return;
  }
  function byId(id) { return document.getElementById('warehouse-' + id); }
  function setText(element, value) {
    value = value == null ? '' : String(value);
    if (element.textContent !== value) element.textContent = value;
  }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, Number(value) || 0)); }
  var stage = byId('stage'), canvas = byId('canvas'), launcher = byId('launcher');
  var play = byId('play'), loading = byId('loading'), progress = byId('progress');
  var loadStatus = byId('load-status'), error = byId('error'), tools = byId('tools');
  var pause = byId('pause'), rotate = byId('rotate'), quality = byId('quality'), stats = byId('stats');
  var menu = byId('menu'), computer = byId('computer'), hud = byId('hud');
  var activity = window.DemoActivity.create(stage), coarsePointer = window.matchMedia('(pointer: coarse)');
  var instance = null, starting = false, failed = false, manuallyPaused = false;
  var preparationStarted = false, graphicsReady = false, playerBuildVersion = null;
  var portrait = false, lastActive = null, loopPaused = false, mode = 'title';
  var menuScreen = '', computerOpen = false, escapeHandled = false, lastComputer = '', wrapperFullscreen = false;
  var hudState = {}, loadingPhase = 'download', loadStart = 0, loadingTimer = null, lastLoadChange = 0;
  var preparationFraction = 0, preparationCompleted = 0, preparationTotal = 7, hasFinePreparation = false;
  var build = 'assets/one-shift-unity/Build/OneShiftWeb', version = '?v=8';
  var preparationNames = ['Night lighting', 'First daylight', 'Morning light', 'Afternoon light', 'Ceiling light controls', 'Fork placement view', 'Opening the doors'];
  var tips = [
    'The first delivery arrives at the north dock.',
    'Carry a pallet low. Lift it to rack height only when you are lined up.',
    'The rear of the forklift swings wide when you turn.',
    'Small parcels arrive beside the front office door.',
    'The dispatch computer keeps the stock and order ledger.'
  ];
  try {
    var saved = JSON.parse(localStorage.getItem('warehouse-display-v1') || 'null');
    if (saved) {
      quality.value = saved.quality === 'sharp' ? 'sharp' : 'smooth';
      byId('show-stats').checked = saved.stats === true;
    }
  } catch (_) { /* Display preferences are optional. */ }

  function saveDisplay() {
    try { localStorage.setItem('warehouse-display-v1', JSON.stringify({quality:quality.value, stats:byId('show-stats').checked})); } catch (_) {}
  }
  function sendCommand(action, id, value) {
    if (!instance || failed) return;
    var command = {action:action};
    if (id != null) command.id = String(id);
    if (value != null) command.value = value;
    instance.SendMessage('BrowserLifecycle', 'UICommand', JSON.stringify(command));
  }
  function unlockPointer() {
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
  }
  function syncStatsVisibility() { stats.hidden = mode !== 'play' || !byId('show-stats').checked; }
  function reportPlayerStats(buildVersion, framesPerSecond, longestFrameMs, frameCount) {
    playerBuildVersion = buildVersion;
    setText(stats, 'v' + buildVersion + ' | ' + (lastActive === false ? 'Paused' : Math.round(framesPerSecond) + ' FPS'));
    stats.title = 'Longest frame: ' + Math.round(longestFrameMs) + ' ms';
    stats.dataset.buildVersion = String(buildVersion);
    stats.dataset.fps = Number(framesPerSecond).toFixed(1);
    stats.dataset.longestFrameMs = Number(longestFrameMs).toFixed(1);
    stats.dataset.frameCount = String(frameCount);
  }
  function setLoadPhase(phase) {
    loadingPhase = phase;
    var order = ['download','engine','prepare'], current = order.indexOf(phase);
    document.querySelectorAll('[data-load-step]').forEach(function (step) {
      var index = order.indexOf(step.dataset.loadStep);
      if (index === current) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
      step.classList.toggle('is-complete', index < current);
    });
    loading.dataset.phase = phase;
  }
  function setLoadProgress(value) {
    if (value === null) { progress.removeAttribute('value'); progress.textContent = 'Working'; }
    else { progress.value = Math.round(clamp(value, 0, 1) * 100); progress.textContent = progress.value + '%'; }
    lastLoadChange = activity.now();
  }
  function loadTick() {
    if (mode !== 'loading' || failed) return;
    var elapsed = Math.floor((activity.now() - loadStart) / 1000);
    setText(byId('load-elapsed'), (elapsed < 60 ? elapsed + 's' : Math.floor(elapsed / 60) + 'm ' + elapsed % 60 + 's') + ' elapsed');
    setText(byId('load-tip'), tips[Math.floor(elapsed / 12) % tips.length]);
    if (activity.now() - lastLoadChange > 12000) {
      if (loadingPhase === 'download') setText(byId('load-detail'), 'Still downloading. The game will open when the files are ready.');
      else if (loadingPhase === 'engine') setText(byId('load-detail'), 'Starting the game engine. This can take a little longer on a first visit.');
      else setText(byId('load-detail'), 'Rendering this scene for the first time. Your shift has not started.');
    }
  }
  function stopLoadingTimer() {
    if (loadingTimer !== null) activity.clearInterval(loadingTimer);
    loadingTimer = null;
  }
  function reportDownload(fraction) {
    if (preparationStarted || failed) return;
    // The generated Unity loader reserves the final tenth for engine startup.
    // Its 0-.9 interval is measured download progress, not scene readiness.
    if (fraction < .9) {
      setLoadPhase('download');
      var downloaded = clamp(fraction / .9, 0, 1);
      setLoadProgress(downloaded);
      setText(loadStatus, 'Downloading game');
      setText(byId('load-count'), Math.round(downloaded * 100) + '%');
      setText(byId('load-detail'), 'Getting the game files. They are cached for your next visit.');
    } else {
      setLoadPhase('engine');
      setLoadProgress(null);
      setText(loadStatus, 'Starting the engine');
      setText(byId('load-count'), '');
      setText(byId('load-detail'), 'The download is complete. Starting the warehouse player.');
    }
  }
  function reportPreparation(completed, total, ready) {
    if (failed) return;
    preparationStarted = true;
    if (ready < 0) { showError('The warehouse could not prepare its graphics. Reload the page to try again.'); return; }
    preparationCompleted = Math.max(0, completed);
    preparationTotal = Math.max(1, total);
    setLoadPhase('prepare');
    if (!hasFinePreparation) {
      preparationFraction = Math.max(preparationFraction, completed / preparationTotal);
      setLoadProgress(ready === 1 ? 1 : Math.min(.99, preparationFraction));
      setText(loadStatus, ready === 1 ? 'Warehouse ready' : preparationNames[Math.min(preparationNames.length - 1, completed)]);
      setText(byId('load-detail'), 'Preparing the lighting and view before your shift starts.');
    }
    setText(byId('load-count'), Math.min(completed + 1, preparationTotal) + ' / ' + preparationTotal);
    graphicsReady = ready === 1;
    revealPreparedGame();
  }
  function reportFinePreparation(value) {
    if (failed) return;
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { return; } }
    if (!value || typeof value !== 'object') return;
    preparationStarted = hasFinePreparation = true;
    setLoadPhase('prepare');
    preparationFraction = Math.max(preparationFraction, clamp(value.fraction, 0, 1));
    setLoadProgress(Math.min(.99, preparationFraction));
    if (value.label) setText(loadStatus, value.label);
    if (value.detail) setText(byId('load-detail'), value.detail);
    if (Number.isFinite(value.completed)) preparationCompleted = value.completed;
    if (Number.isFinite(value.total) && value.total > 0) preparationTotal = value.total;
    setText(byId('load-count'), Math.min(preparationCompleted + 1, preparationTotal) + ' / ' + preparationTotal);
  }
  function revealPreparedGame() {
    if (!instance || !graphicsReady || failed || mode === 'play') return;
    stopLoadingTimer();
    mode = 'play';
    loading.hidden = true;
    launcher.hidden = true;
    tools.hidden = false;
    hud.hidden = false;
    setText(byId('session-note'), 'Your current shift is still open.');
    play.innerHTML = '<span>Resume shift</span><span aria-hidden="true">&gt;</span>';
    play.disabled = false;
    byId('main-menu').hidden = false;
    syncOrientation();
    syncStatsVisibility();
    if (activity.active() && !portrait && !manuallyPaused && !menuScreen && !computerOpen) canvas.focus({preventScroll:true});
  }
  function sizeCanvas(resuming) {
    var sharper = quality.value === 'sharp';
    var width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
    var pixelBudget = sharper ? 2560 * 1440 : 1920 * 1080;
    var ratio = Math.min(window.devicePixelRatio || 1, sharper ? 1.5 : 1.25, Math.sqrt(pixelBudget / (width * height)));
    var renderWidth = Math.max(1, Math.floor(width * ratio)), renderHeight = Math.max(1, Math.floor(height * ratio));
    // Fullscreen can report several sizes while Unity's renderer is stopped.
    // Keep its drawing buffer intact until the next active frame; CSS still
    // fits the paused picture to the current window immediately.
    if (instance && loopPaused && !resuming) return;
    if (canvas.width !== renderWidth) canvas.width = renderWidth;
    if (canvas.height !== renderHeight) canvas.height = renderHeight;
  }
  function syncActivity() {
    // Download callbacks can change the progress state while the page is hidden.
    // Keep a newly created indeterminate animation under the same activity gate.
    progress.style.animationPlayState = activity.active() ? 'running' : 'paused';
    pause.setAttribute('aria-pressed', String(manuallyPaused));
    byId('hydraulics').hidden = !hudState.hydraulics || !activity.active() || manuallyPaused || !!menuScreen || computerOpen || portrait;
    if (!instance) return;
    var active = activity.active() && !manuallyPaused && !menuScreen && !computerOpen && !portrait && !failed && mode !== 'title';
    if (active === lastActive) return;
    if (playerBuildVersion !== null) setText(stats, 'v' + playerBuildVersion + (active ? ' | Measuring...' : ' | Paused'));
    var module = instance.Module;
    if (active) {
      sizeCanvas(true);
      if (loopPaused && module) {
        if (typeof module.SetRefreshMonitorActive === 'function') module.SetRefreshMonitorActive(true);
        if (typeof module.resumeMainLoop === 'function') module.resumeMainLoop();
      }
      loopPaused = false;
      instance.SendMessage('BrowserLifecycle', 'SetBrowserActive', '1');
    } else {
      hudState.hydraulics = false;
      byId('hydraulics').hidden = true;
      instance.SendMessage('BrowserLifecycle', 'SetBrowserActive', '0');
      if (module && typeof module.SetRefreshMonitorActive === 'function') module.SetRefreshMonitorActive(false);
      if (module && typeof module.pauseMainLoop === 'function') { module.pauseMainLoop(); loopPaused = true; }
      unlockPointer();
    }
    lastActive = active;
  }
  function syncDialogVisibility() {
    if (portrait) {
      if (menu.open) menu.close();
      if (computer.open) computer.close();
    } else if (computerOpen) {
      if (menu.open) menu.close();
      if (!computer.open) computer.showModal();
    } else if (menuScreen) {
      if (!menu.open) menu.showModal();
    }
  }
  function syncOrientation() {
    sizeCanvas();
    portrait = coarsePointer.matches && window.innerHeight > window.innerWidth;
    rotate.hidden = !portrait;
    syncDialogVisibility();
    syncActivity();
  }
  function menuBack() {
    if (instance && mode !== 'title') openMenu('pause');
    else closeMenu(false);
  }
  function openMenu(screen) {
    if (failed && screen === 'pause') return;
    if (computerOpen) closeComputer(false);
    var wasMenu = !!menuScreen;
    menuScreen = screen;
    if (instance && mode !== 'title') {
      manuallyPaused = true;
      if (!wasMenu) sendCommand('menu');
    }
    ['paused','settings','controls','about'].forEach(function (id) { byId(id).hidden = true; });
    byId({pause:'paused',settings:'settings',help:'controls',about:'about'}[screen]).hidden = false;
    setText(byId('menu-title'), {pause:'Paused',settings:'Settings',help:'How to play',about:'The warehouse'}[screen]);
    byId('menu-back').hidden = screen === 'pause' || screen === 'help';
    unlockPointer();
    syncActivity();
    syncDialogVisibility();
    var first = screen === 'pause' ? byId('resume') : byId('close-menu');
    if (!portrait) first.focus({preventScroll:true});
  }
  function closeMenu(resume) {
    menuScreen = '';
    if (menu.open) menu.close();
    if (resume && instance && mode !== 'title') {
      manuallyPaused = false;
    }
    syncActivity();
    if (mode === 'play' && !manuallyPaused && !portrait) canvas.focus({preventScroll:true});
    // Pointer lock needs the trusted button/key action and an active controller.
    // Resume the engine before asking Unity to capture the mouse again.
    if (resume && instance && mode !== 'title' && lastActive === true) resumeControls();
  }
  function resumeControls() {
    // Unity defers requests made outside its own input handlers. Request the
    // browser lock from this trusted HTML click/key before restoring its input
    // state, so Resume and Close do not need a second click on the warehouse.
    if (document.pointerLockElement !== canvas && canvas.requestPointerLock) {
      try {
        var request = canvas.requestPointerLock();
        if (request && typeof request.catch === 'function') request.catch(function () {});
      } catch (_) { /* The normal Click hint remains available if capture is denied. */ }
    }
    sendCommand('resume');
  }
  function resume() {
    if (computerOpen) closeComputer(false);
    if (mode === 'title' && instance) {
      mode = 'play'; launcher.hidden = true; tools.hidden = false; hud.hidden = false; syncStatsVisibility();
    }
    closeMenu(true);
  }
  function returnTitle() {
    manuallyPaused = true;
    closeMenu(false);
    mode = 'title';
    launcher.hidden = false;
    loading.hidden = true;
    byId('main-menu').hidden = false;
    tools.hidden = hud.hidden = true;
    syncStatsVisibility();
    syncActivity();
    play.focus({preventScroll:true});
  }
  function releaseMouseCapture(event) {
    // Walking, driving and the office deliberately transfer cursor ownership.
    // A pointer-lock change alone does not express a request to pause. Their
    // controllers already stop input when capture is absent. Only a failed
    // capture needs this explicit input reset; Escape is handled as a key.
    if (event.type !== 'pointerlockerror' || !instance || lastActive !== true || document.pointerLockElement === canvas) return;
    instance.SendMessage('BrowserLifecycle', 'SetBrowserActive', '0');
    lastActive = null;
    syncActivity();
  }
  function showError(message) {
    if (failed) return;
    failed = true;
    stopLoadingTimer();
    setText(error, message);
    error.hidden = false;
    loading.hidden = true;
    launcher.hidden = false;
    tools.hidden = hud.hidden = true;
    byId('main-menu').hidden = false;
    play.disabled = false;
    setText(play, 'Reload and try again');
    syncActivity();
  }
  function start() {
    if (failed) { window.location.reload(); return; }
    if (instance && graphicsReady) { resume(); return; }
    if (starting || portrait) return;
    var probe = document.createElement('canvas'), gl = probe.getContext('webgl2');
    if (!gl || typeof WebAssembly !== 'object') {
      showError('This browser cannot run the warehouse. Use a browser with WebGL 2 enabled. The illustrated game is available in About.');
      return;
    }
    var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    starting = true; mode = 'loading'; play.disabled = true;
    byId('main-menu').hidden = true; loading.hidden = false;
    loadStart = lastLoadChange = activity.now();
    loadingTimer = activity.setInterval(loadTick, 1000);
    var script = document.createElement('script');
    script.src = build + '.loader.js' + version; script.async = true;
    script.onerror = function () { showError('The warehouse could not download. Check your connection and try again.'); };
    script.onload = function () {
      if (typeof window.createUnityInstance !== 'function') { showError('The warehouse could not start. Reload the page to try again.'); return; }
      canvas.hidden = false;
      window.createUnityInstance(canvas, {
        dataUrl:build + '.data.unityweb' + version,
        frameworkUrl:build + '.framework.js.unityweb' + version,
        codeUrl:build + '.wasm.unityweb' + version,
        streamingAssetsUrl:'assets/one-shift-unity/StreamingAssets',
        companyName:'Ethan Willingham', productName:'The Warehouse Simulator', productVersion:'8',
        matchWebGLToCanvasSize:false, devicePixelRatio:1,
        onOneShiftStats:reportPlayerStats, onOneShiftPreparation:reportPreparation,
        onWarehousePreparation:reportFinePreparation, onWarehouseHUD:reportHUD,
        showBanner:function (message, type) {
          if (type === 'error') { console.error(message); showError('The warehouse stopped while loading. Reload the page to try again.'); }
        }
      }, reportDownload).then(function (game) {
        instance = game;
        if (!game.Module || typeof game.Module.pauseMainLoop !== 'function' || typeof game.Module.resumeMainLoop !== 'function' || typeof game.Module.SetRefreshMonitorActive !== 'function') {
          showError('The warehouse could not initialize its controls. Reload the page to try again.'); game.Quit(); return;
        }
        if (failed) { syncActivity(); return; }
        syncOrientation();
        revealPreparedGame();
      }).catch(function (reason) {
        console.error(reason);
        showError('The warehouse could not start. Reload to try again. The illustrated game is available in About.');
      });
    };
    document.body.appendChild(script);
  }
  function reportHUD(value) {
    if (failed) return;
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { return; } }
    if (!value || typeof value !== 'object') return;
    hudState = value;
    setText(byId('clock'), value.clock);
    setText(byId('location'), value.location || 'Warehouse floor');
    setText(byId('objective'), value.objective);
    setText(byId('objective-detail'), typeof value.detail === 'string' ? value.detail.replace(/\s{2,}/g, ' / ') : value.detail);
    byId('context').hidden = !value.hint;
    byId('hint-key').hidden = !value.hintKey;
    setText(byId('hint-key'), value.hintKey);
    setText(byId('hint'), value.hint);
    byId('notice').hidden = !value.notice;
    setText(byId('notice'), value.notice);
    byId('drive-status').hidden = !value.driving;
    setText(byId('fork-height'), (clamp(value.forkHeight, 0, 100) * 3.28084).toFixed(1) + ' ft');
    var training = {
      brake:['First drive / 1 of 3','Press Space to check the brake.'],
      lift:['First drive / 2 of 3','Hold Left Shift and move the lever up to raise the empty forks.'],
      center:['First drive / 3 of 3','Bring the lever back to centre, then release Left Shift.']
    }[value.training];
    byId('training').hidden = !training;
    if (training) { setText(byId('training-step'), training[0]); setText(byId('training-copy'), training[1]); }
    var position = clamp(value.hydraulicInput, -1, 1), speed = clamp(value.forkSpeed, -1, 1);
    byId('lever-knob').style.top = (50 - position * 50) + '%';
    byId('lever-fill').style.top = (position >= 0 ? 50 - position * 50 : 50) + '%';
    byId('lever-fill').style.height = Math.abs(position * 50) + '%';
    setText(byId('fork-speed'), Math.abs(speed) < .005 ? 'Neutral' : (speed > 0 ? '+' : '-') + Math.round(Math.abs(speed) * 100) + '% ' + (speed > 0 ? 'raise' : 'lower'));
    byId('hydraulics').hidden = !value.hydraulics || !activity.active() || manuallyPaused || !!menuScreen || computerOpen || portrait;
    if (value.computer) renderComputer(value.computer);
  }
  function money(value) {
    if (typeof value === 'string') return value;
    return new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}).format(Number(value) || 0);
  }
  function element(tag, text, className) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }
  function makeTable(target, headings, rows, empty) {
    target.replaceChildren();
    if (!rows.length) { target.appendChild(element('p', empty, 'warehouse-desk-empty')); return; }
    var table = element('table', null, 'warehouse-desk-table'), head = element('thead'), tr = element('tr');
    headings.forEach(function (heading) { var th = element('th', heading); th.scope = 'col'; tr.appendChild(th); });
    head.appendChild(tr); table.appendChild(head);
    var body = element('tbody');
    rows.forEach(function (row) { var line = element('tr'); row.forEach(function (cell) { line.appendChild(element('td', cell)); }); body.appendChild(line); });
    table.appendChild(body); target.appendChild(table);
  }
  function makeOrders(target, orders, command, empty) {
    target.replaceChildren();
    if (!orders.length) { target.appendChild(element('p', empty, 'warehouse-desk-empty')); return; }
    orders.forEach(function (order) {
      var row = element('article', null, 'warehouse-desk-row'), copy = element('div'), action = element('div');
      copy.appendChild(element('h3', order.name)); copy.appendChild(element('p', order.detail));
      if (order.status) copy.appendChild(element('p', order.status, 'warehouse-desk-status'));
      action.appendChild(element('output', money(order.price)));
      function appendAction(label, actionCommand, enabled, secondary) {
        var button = element('button', label, secondary ? 'warehouse-order-secondary' : '');
        button.type = 'button'; button.disabled = enabled === false;
        button.dataset.action = actionCommand; button.dataset.id = String(order.id);
        button.addEventListener('click', function () {
          // Keep both actions on this order locked until its authoritative reply.
          action.querySelectorAll('button').forEach(function (pending) { pending.disabled = true; });
          // A declined command can legitimately return an unchanged snapshot.
          // That reply must still release the pending action control.
          lastComputer = '';
          sendCommand(actionCommand, order.id);
        });
        action.appendChild(button);
      }
      if (order.action) appendAction(order.action, command, order.enabled, false);
      if (order.secondaryAction && order.secondaryCommand)
        appendAction(order.secondaryAction, order.secondaryCommand, order.secondaryEnabled, true);
      row.appendChild(copy); row.appendChild(action); target.appendChild(row);
    });
  }
  function renderComputer(value) {
    if (value.open && !computerOpen) {
      computerOpen = true;
      menuScreen = '';
      if (menu.open) menu.close();
      unlockPointer();
      syncActivity();
      syncDialogVisibility();
    } else if (!value.open && computerOpen) {
      computerOpen = false;
      if (computer.open) computer.close();
      syncActivity();
    }
    if (!value.open) return;
    var serialized = JSON.stringify(value);
    if (serialized === lastComputer) return;
    lastComputer = serialized;
    var focused = document.activeElement;
    var focusAction = focused && focused.dataset.action, focusId = focused && focused.dataset.id;
    setText(byId('computer-title'), value.title || 'Warehouse desk');
    setText(byId('computer-summary'), value.summary);
    setText(byId('computer-cash'), money(value.cash));
    setText(byId('computer-message'), value.message);
    makeTable(byId('inventory'), ['Item','Available'], (value.inventory || []).map(function (item) { return [item.name, item.quantity + (item.unit ? ' ' + item.unit : '')]; }), 'Stock will appear here as deliveries are received.');
    makeOrders(byId('orders'), value.orders || [], 'order', 'No supplier stock is available.');
    makeOrders(byId('contracts'), value.contracts || [], 'contract', 'There are no open customer orders.');
    makeTable(byId('ledger'), ['Transaction','Amount'], (value.ledger || []).map(function (entry) { return [entry.label, money(entry.amount)]; }), 'Transactions will appear here after your first order.');
    if (focusAction) {
      var replacement = Array.from(computer.querySelectorAll('button[data-action]')).find(function (button) { return button.dataset.action === focusAction && button.dataset.id === focusId && !button.disabled; });
      if (replacement) replacement.focus({preventScroll:true});
      else computer.querySelector('[role="tab"][aria-selected="true"]').focus({preventScroll:true});
    }
  }
  function closeComputer(resumePlay) {
    if (!computerOpen) return;
    computerOpen = false;
    lastComputer = '';
    if (computer.open) computer.close();
    sendCommand('computer-close');
    syncActivity();
    if (resumePlay && !manuallyPaused && mode === 'play' && !portrait) canvas.focus({preventScroll:true});
    if (resumePlay && lastActive === true) resumeControls();
  }
  function switchTabs(buttons, attribute, prefix, value, focus) {
    buttons.forEach(function (button) {
      var selected = button.dataset[attribute] === value;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      byId(prefix + button.dataset[attribute]).hidden = !selected;
      if (selected && focus) button.focus();
    });
  }
  function wireTabs(selector, attribute, prefix) {
    var buttons = Array.from(document.querySelectorAll(selector));
    buttons.forEach(function (button, index) {
      button.addEventListener('click', function () { switchTabs(buttons, attribute, prefix, button.dataset[attribute], false); });
      button.addEventListener('keydown', function (event) {
        var next = event.key === 'ArrowRight' ? (index + 1) % buttons.length : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); switchTabs(buttons, attribute, prefix, buttons[next].dataset[attribute], true);
      });
    });
  }
  function toggleFullscreen() {
    var request;
    if (document.fullscreenElement && document.exitFullscreen) request = document.exitFullscreen();
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) request = document.webkitExitFullscreen();
    else if (stage.requestFullscreen) request = stage.requestFullscreen();
    else if (stage.webkitRequestFullscreen) request = stage.webkitRequestFullscreen();
    if (request && request.catch) request.catch(function () { document.querySelectorAll('[data-fullscreen]').forEach(function (button) { setText(button, 'Full screen unavailable'); }); });
  }
  function syncFullscreen(event) {
    var fullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    var owned = fullscreen === stage || wrapperFullscreen || (event && event.target === stage);
    wrapperFullscreen = fullscreen === stage;
    // The HTML wrapper owns this fullscreen surface and drawing-buffer size.
    // Unity's canvas-only fullscreen handler must not reconfigure its targets
    // in response to the surrounding menu/HUD element entering fullscreen.
    if (owned && event) event.stopImmediatePropagation();
    document.querySelectorAll('[data-fullscreen]').forEach(function (button) {
      button.hidden = !stage.requestFullscreen && !stage.webkitRequestFullscreen;
      setText(button, document.fullscreenElement || document.webkitFullscreenElement ? 'Exit full screen' : 'Full screen');
    });
    syncOrientation();
  }
  play.addEventListener('click', start);
  quality.addEventListener('change', function () { sizeCanvas(); saveDisplay(); });
  byId('show-stats').addEventListener('change', function () { syncStatsVisibility(); saveDisplay(); });
  pause.addEventListener('click', function () { openMenu('pause'); });
  byId('resume').addEventListener('click', resume);
  byId('return-title').addEventListener('click', returnTitle);
  byId('close-menu').addEventListener('click', function () { if (menuScreen === 'pause') resume(); else menuBack(); });
  byId('menu-back').addEventListener('click', menuBack);
  byId('close-help').addEventListener('click', menuBack);
  byId('computer-close').addEventListener('click', function () { closeComputer(true); });
  document.querySelectorAll('[data-screen]').forEach(function (button) { button.addEventListener('click', function () { openMenu(button.dataset.screen); }); });
  document.querySelectorAll('[data-fullscreen]').forEach(function (button) { button.addEventListener('click', toggleFullscreen); });
  wireTabs('[data-help-tab]', 'helpTab', 'help-');
  wireTabs('[data-desk-tab]', 'deskTab', 'desk-');
  menu.addEventListener('cancel', function (event) { event.preventDefault(); if (menuScreen === 'pause') resume(); else menuBack(); });
  computer.addEventListener('cancel', function (event) { event.preventDefault(); closeComputer(true); });
  window.addEventListener('fullscreenchange', syncFullscreen, true);
  window.addEventListener('webkitfullscreenchange', syncFullscreen, true);
  window.addEventListener('keydown', function (event) {
    if (!instance || event.ctrlKey || event.metaKey || event.altKey || mode === 'title') return;
    if (event.code === 'Escape') {
      // The shell owns Escape throughout play. Do not leave its keydown in
      // Unity's input queue while paused, where it could release a fresh
      // capture on the first resumed frame.
      escapeHandled = true;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (computerOpen) closeComputer(true);
      else if (menuScreen) { if (menuScreen === 'pause') resume(); else menuBack(); }
      else openMenu('pause');
      return;
    }
    if (event.repeat) return;
    var input = event.target && /INPUT|SELECT|TEXTAREA/.test(event.target.tagName);
    if (input) return;
    if (event.code === 'KeyP' && !computerOpen) {
      event.preventDefault();
      if (menuScreen) resume(); else openMenu('pause');
    } else if ((event.code === 'Tab' || event.code === 'F1') && !menuScreen && !computerOpen && graphicsReady) {
      event.preventDefault(); openMenu('help');
    }
  }, true);
  window.addEventListener('keyup', function (event) {
    if (event.code !== 'Escape') return;
    // Some browsers reserve Escape's keydown for their pointer-lock UI but
    // deliver keyup. Do not reopen a menu that this same key just closed.
    if (escapeHandled) { event.preventDefault(); event.stopImmediatePropagation(); }
    else if (instance && graphicsReady && mode === 'play' && !menuScreen && !computerOpen && !portrait && activity.active() && document.hasFocus()) {
      event.preventDefault(); event.stopImmediatePropagation(); openMenu('pause');
    }
    escapeHandled = false;
  }, true);
  window.addEventListener('resize', syncOrientation);
  document.addEventListener('pointerlockchange', releaseMouseCapture);
  document.addEventListener('pointerlockerror', releaseMouseCapture);
  if (coarsePointer.addEventListener) coarsePointer.addEventListener('change', syncOrientation);
  activity.onChange(syncActivity);
  syncFullscreen();
})();
