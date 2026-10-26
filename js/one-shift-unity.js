(function () {
  'use strict';
  // Existing shared floor plans belong to the illustrated game's save format.
  if (window.location.hash.startsWith('#layout=')) {
    window.location.replace('one-shift-classic.html' + window.location.hash);
    return;
  }
  var stage = document.getElementById('warehouse-stage');
  var canvas = document.getElementById('warehouse-canvas');
  var launcher = document.getElementById('warehouse-launcher');
  var play = document.getElementById('warehouse-play');
  var loading = document.getElementById('warehouse-loading');
  var progress = document.getElementById('warehouse-progress');
  var loadStatus = document.getElementById('warehouse-load-status');
  var error = document.getElementById('warehouse-error');
  var tools = document.getElementById('warehouse-tools');
  var pause = document.getElementById('warehouse-pause');
  var paused = document.getElementById('warehouse-paused');
  var rotate = document.getElementById('warehouse-rotate');
  var help = document.getElementById('warehouse-help');
  var controls = document.getElementById('warehouse-controls');
  var fullscreen = document.getElementById('warehouse-fullscreen');
  var quality = document.getElementById('warehouse-quality');
  var stats = document.getElementById('warehouse-stats');
  var activity = window.DemoActivity.create(stage);
  var coarsePointer = window.matchMedia('(pointer: coarse)');
  var instance = null, starting = false, failed = false, manuallyPaused = false;
  var preparationStarted = false, graphicsReady = false, playerBuildVersion = null;
  var portrait = false, lastActive = null, loopPaused = false;
  var build = 'assets/one-shift-unity/Build/OneShiftWeb';
  var version = '?v=6';

  function reportPlayerStats(buildVersion, framesPerSecond, longestFrameMs, frameCount) {
    if (!stats) return;
    playerBuildVersion = buildVersion;
    // These values come from completed Unity render frames, so an idle page's
    // animation callbacks cannot make a stalled game report a healthy rate.
    stats.textContent = 'v' + buildVersion + ' | ' +
      (lastActive === false ? 'Paused' : Math.round(framesPerSecond) + ' FPS');
    stats.title = 'Longest frame: ' + Math.round(longestFrameMs) + ' ms';
    stats.dataset.buildVersion = String(buildVersion);
    stats.dataset.fps = framesPerSecond.toFixed(1);
    stats.dataset.longestFrameMs = longestFrameMs.toFixed(1);
    stats.dataset.frameCount = String(frameCount);
  }

  function reportPreparation(completed, total, ready) {
    if (failed) return;
    preparationStarted = true;
    if (ready < 0) {
      showError('The warehouse could not prepare its graphics. Reload the page to try again.');
      return;
    }
    progress.value = Math.round(100 * completed / Math.max(1, total));
    progress.textContent = completed + ' of ' + total;
    loadStatus.textContent = 'Preparing graphics... ' + completed + ' of ' + total;
    graphicsReady = ready === 1;
    revealPreparedGame();
  }

  function revealPreparedGame() {
    // The native callback can precede the loader Promise. Both must finish.
    if (!instance || !graphicsReady || failed) return;
    progress.value = 100;
    launcher.hidden = true;
    tools.hidden = false;
    fullscreen.hidden = !stage.requestFullscreen && !stage.webkitRequestFullscreen;
    syncOrientation();
    if (activity.active() && !portrait && !manuallyPaused) canvas.focus({ preventScroll: true });
  }

  function sizeCanvas() {
    // Retina screens can otherwise turn a normal browser window into an
    // eight-million-pixel render target. Keep the CSS view full size while
    // giving the player a bounded choice of drawing-buffer resolution.
    var sharper = quality.value === 'sharp';
    var width = Math.max(1, stage.clientWidth), height = Math.max(1, stage.clientHeight);
    var pixelBudget = sharper ? 2560 * 1440 : 1920 * 1080;
    var ratio = Math.min(window.devicePixelRatio || 1, sharper ? 1.5 : 1.25,
      Math.sqrt(pixelBudget / (width * height)));
    var renderWidth = Math.max(1, Math.floor(width * ratio));
    var renderHeight = Math.max(1, Math.floor(height * ratio));
    if (canvas.width !== renderWidth) canvas.width = renderWidth;
    if (canvas.height !== renderHeight) canvas.height = renderHeight;
  }

  function syncActivity() {
    paused.hidden = !instance || !manuallyPaused;
    pause.textContent = manuallyPaused ? 'Resume' : 'Pause';
    pause.setAttribute('aria-pressed', String(manuallyPaused));
    if (!instance) return;
    var active = activity.active() && !manuallyPaused && !portrait && !failed;
    if (active === lastActive) return;
    if (stats && playerBuildVersion !== null)
      stats.textContent = 'v' + playerBuildVersion + (active ? ' | Measuring...' : ' | Paused');
    // The engine stops its own scheduler. Never replace browser scheduling APIs.
    var module = instance.Module;
    if (active) {
      if (loopPaused && module) {
        if (typeof module.SetRefreshMonitorActive === 'function') module.SetRefreshMonitorActive(true);
        if (typeof module.resumeMainLoop === 'function') module.resumeMainLoop();
      }
      loopPaused = false;
      instance.SendMessage('BrowserLifecycle', 'SetBrowserActive', '1');
    } else {
      instance.SendMessage('BrowserLifecycle', 'SetBrowserActive', '0');
      if (module && typeof module.SetRefreshMonitorActive === 'function') module.SetRefreshMonitorActive(false);
      if (module && typeof module.pauseMainLoop === 'function') {
        module.pauseMainLoop();
        loopPaused = true;
      }
      if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    }
    lastActive = active;
  }

  function syncOrientation() {
    sizeCanvas();
    portrait = coarsePointer.matches && window.innerHeight > window.innerWidth;
    rotate.hidden = !portrait;
    syncActivity();
  }

  function setPause(value) {
    manuallyPaused = value;
    syncActivity();
    if (!value) canvas.focus({ preventScroll: true });
  }

  function releaseMouseCapture() {
    if (!instance || lastActive !== true || document.pointerLockElement === canvas) return;
    // The browser can consume Escape or deny pointer lock before Unity sees it.
    // Clear the walk controller's capture and held input without changing pause.
    instance.SendMessage('BrowserLifecycle', 'SetBrowserActive', '0');
    lastActive = null;
    syncActivity();
  }

  function showError(message) {
    if (failed) return;
    failed = true;
    error.textContent = message;
    error.hidden = false;
    loading.hidden = true;
    launcher.hidden = false;
    tools.hidden = true;
    play.disabled = false;
    play.textContent = 'Reload and try again';
    syncActivity();
  }

  function start() {
    if (failed) { window.location.reload(); return; }
    if (starting || instance || portrait) return;
    var probe = document.createElement('canvas');
    var gl = probe.getContext('webgl2');
    if (!gl || typeof WebAssembly !== 'object') {
      showError('This browser cannot run the warehouse. Try a browser with WebGL 2 enabled, or open the illustrated game below.');
      return;
    }
    var lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    starting = true;
    play.disabled = true;
    play.textContent = 'Loading...';
    loading.hidden = false;
    var script = document.createElement('script');
    script.src = build + '.loader.js' + version;
    script.async = true;
    script.onerror = function () { showError('The warehouse could not download. Check your connection and try again.'); };
    script.onload = function () {
      if (typeof window.createUnityInstance !== 'function') {
        showError('The warehouse could not start. Reload the page to try again.');
        return;
      }
      canvas.hidden = false;
      window.createUnityInstance(canvas, {
        dataUrl: build + '.data.unityweb' + version,
        frameworkUrl: build + '.framework.js.unityweb' + version,
        codeUrl: build + '.wasm.unityweb' + version,
        streamingAssetsUrl: 'assets/one-shift-unity/StreamingAssets',
        companyName: 'Ethan Willingham',
        productName: 'One Shift',
        productVersion: '1',
        // The page sizes the drawing buffer on resize and quality changes.
        // Unity still owns rendering and all of its scheduling.
        matchWebGLToCanvasSize: false,
        devicePixelRatio: 1,
        onOneShiftStats: reportPlayerStats,
        onOneShiftPreparation: reportPreparation,
        showBanner: function (message, type) {
          if (type === 'error') {
            console.error(message);
            showError('The warehouse stopped while loading. Reload the page to try again.');
          }
        }
      }, function (fraction) {
        if (preparationStarted) return;
        var percent = Math.min(100, Math.round(fraction * 100));
        progress.value = percent;
        progress.textContent = percent + '%';
        loadStatus.textContent = percent >= 90 ? 'Starting warehouse...' : 'Loading warehouse... ' + percent + '%';
      }).then(function (game) {
        instance = game;
        if (!game.Module || typeof game.Module.pauseMainLoop !== 'function' || typeof game.Module.resumeMainLoop !== 'function' || typeof game.Module.SetRefreshMonitorActive !== 'function') {
          showError('The warehouse could not initialize its controls. Reload the page to try again.');
          game.Quit();
          return;
        }
        if (failed) { syncActivity(); return; }
        // Activity gates also apply during preparation; a hidden page must not
        // keep warming or begin the delivery when the final callback arrives.
        syncOrientation();
        revealPreparedGame();
      }).catch(function (reason) {
        console.error(reason);
        showError('The warehouse could not start. Reload to try again, or open the illustrated game below.');
      });
    };
    document.body.appendChild(script);
  }

  play.addEventListener('click', start);
  quality.addEventListener('change', sizeCanvas);
  pause.addEventListener('click', function () { setPause(!manuallyPaused); });
  document.getElementById('warehouse-resume').addEventListener('click', function () { setPause(false); });
  help.addEventListener('click', function () {
    controls.hidden = !controls.hidden;
    help.setAttribute('aria-expanded', String(!controls.hidden));
  });
  document.getElementById('warehouse-close-help').addEventListener('click', function () {
    controls.hidden = true;
    help.setAttribute('aria-expanded', 'false');
    help.focus();
  });
  fullscreen.addEventListener('click', function () {
    var request;
    if (document.fullscreenElement && document.exitFullscreen) request = document.exitFullscreen();
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) request = document.webkitExitFullscreen();
    else if (stage.requestFullscreen) request = stage.requestFullscreen();
    else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
    if (request && request.catch) request.catch(function () { fullscreen.textContent = 'Fullscreen unavailable'; });
  });
  function syncFullscreen() {
    fullscreen.textContent = document.fullscreenElement || document.webkitFullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
    syncOrientation();
  }
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);
  window.addEventListener('keydown', function (event) {
    if (instance && event.code === 'KeyP' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      setPause(!manuallyPaused);
    }
  }, true);
  window.addEventListener('resize', syncOrientation);
  document.addEventListener('pointerlockchange', releaseMouseCapture);
  document.addEventListener('pointerlockerror', releaseMouseCapture);
  if (coarsePointer.addEventListener) coarsePointer.addEventListener('change', syncOrientation);
  activity.onChange(syncActivity);
  syncOrientation();
})();
