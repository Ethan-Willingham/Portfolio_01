(function () {
  'use strict';
  var instance = null, activity = null, stage = null, canvas = null, slot = null;
  var currentState = null, callbacks = {}, ready = false, graphicsReady = false, failed = false;
  var shown = false, paused = false, modal = false, portrait = false, loopPaused = false, active = null;
  var lastLesson = '', lastSnapshot = '', syncVersion = 0, acknowledged = -1;
  var coarse = window.matchMedia('(pointer: coarse)');
  var build = 'assets/one-shift-unity/Build/OneShiftWeb', version = '?v=14';
  var gate, loading, status, detail, progress, pauseButton, orientationGate;
  function text(node,value) { if (node.textContent !== value) node.textContent = value; }
  function command(action,value) {
    if (instance && !failed) instance.SendMessage('BrowserLifecycle','UICommand',JSON.stringify({action:action,value:value}));
  }
  function taskAllowed() { return shown && ready && !failed && !portrait && !paused && !modal; }
  function allow() { return taskAllowed() && activity.active(); }
  function controls() {
    var task = document.querySelector('.in-task');
    // A narrow page can scroll the dock out of view while the form is visible.
    // Stop the renderer there, but keep the current receipt usable.
    if (task) { task.inert = !taskAllowed(); task.classList.toggle('is-loading',!ready); task.setAttribute('aria-busy',String(!ready)); }
  }
  function resize() {
    if (!canvas || !stage) return;
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || loopPaused) return;
    var ratio = Math.min(window.devicePixelRatio || 1,1.25,Math.sqrt(1600000 / (rect.width * rect.height)));
    var width = Math.floor(rect.width * ratio), height = Math.floor(rect.height * ratio);
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }
  function syncActivity() {
    if (!stage) return;
    portrait = shown && coarse.matches && innerHeight > innerWidth;
    orientationGate.hidden = !portrait;
    document.getElementById('inbound-app').inert = portrait;
    var shouldRun = shown && !failed && !portrait && !paused && !modal && activity.active();
    gate.hidden = !ready || shouldRun;
    text(gate.querySelector('h2'),paused ? 'Warehouse paused' : portrait ? 'Turn your screen sideways' : 'Your warehouse is waiting');
    text(gate.querySelector('button'),paused ? 'Resume warehouse' : 'Continue warehouse');
    pauseButton.textContent = paused ? 'Resume warehouse' : 'Pause warehouse';
    pauseButton.setAttribute('aria-pressed',String(paused));
    stage.dataset.active = String(shouldRun);
    controls();
    if (!instance || !instance.Module || !instance.Module.SetRefreshMonitorActive || !instance.Module.pauseMainLoop || !instance.Module.resumeMainLoop || shouldRun === active) return;
    active = shouldRun;
    if (shouldRun) {
      if (loopPaused) { instance.Module.SetRefreshMonitorActive(true); instance.Module.resumeMainLoop(); loopPaused = false; }
      resize();
      instance.SendMessage('BrowserLifecycle','SetBrowserActive','1');
    } else {
      instance.SendMessage('BrowserLifecycle','SetBrowserActive','0');
      instance.Module.SetRefreshMonitorActive(false); instance.Module.pauseMainLoop(); loopPaused = true;
    }
  }
  function error(message) {
    failed = true; ready = false; loading.hidden = false;
    stage.dataset.ready = 'false'; pauseButton.disabled = true;
    text(status,'The warehouse could not open'); text(detail,message);
    progress.hidden = true; loading.querySelector('a').hidden = false;
    syncActivity();
  }
  function updateReady() {
    ready = !!instance && graphicsReady && acknowledged === syncVersion && !failed;
    stage.dataset.ready = String(ready);
    loading.hidden = ready; pauseButton.disabled = !ready;
    if (ready) controls();
    syncActivity();
  }
  function synchronize(force) {
    if (!currentState) return;
    var payload = JSON.stringify(currentState);
    if (!force && payload === lastSnapshot) { controls(); return; }
    var setup = lastLesson !== currentState.scenario.id;
    lastLesson = currentState.scenario.id; lastSnapshot = payload;
    var state = JSON.parse(payload); state.syncVersion = ++syncVersion;
    window.OneShiftShell = {lesson:state.scenario.id,initialInboundState:state};
    if (instance) command(setup ? 'inbound-setup' : 'inbound-sync',JSON.stringify(state));
    else if (syncVersion > 1) acknowledged = -1;
    updateReady();
  }
  function init() {
    stage = document.createElement('section'); stage.className = 'in-warehouse-stage'; stage.setAttribute('aria-label','Interactive 3D receiving dock');
    stage.innerHTML = '<canvas id="in-warehouse-canvas" width="800" height="600" tabindex="0" aria-label="3D warehouse delivery. Click a carton to read its label. Use the practice controls beside it to receive the delivery."></canvas>' +
      '<div class="in-warehouse-loading"><h2 id="in-load-status" role="status">Opening your receiving lesson</h2><progress max="100" value="0" aria-labelledby="in-load-status"></progress><p class="in-load-detail">The warehouse downloads once. Other lessons reuse it.</p><a href="one-shift.html#inbound" hidden>Reload this page to try again</a></div>' +
      '<div class="in-warehouse-gate" hidden><h2>Warehouse paused</h2><p>Your progress stays here.</p><button type="button">Resume warehouse</button></div><div class="in-warehouse-controls"><span>Receiving door 2 / REC-02</span><button type="button" disabled aria-pressed="false">Pause warehouse</button></div>';
    canvas = stage.querySelector('canvas'); loading = stage.querySelector('.in-warehouse-loading');
    status = loading.querySelector('h2'); detail = loading.querySelector('p'); progress = loading.querySelector('progress');
    gate = stage.querySelector('.in-warehouse-gate'); pauseButton = stage.querySelector('.in-warehouse-controls button');
    orientationGate = document.createElement('div'); orientationGate.className = 'in-orientation-gate'; orientationGate.hidden = true;
    orientationGate.innerHTML = '<h1>Turn your screen sideways</h1><p>Your receiving lesson will wait.</p>'; document.body.appendChild(orientationGate);
    pauseButton.addEventListener('click',function () { paused = !paused; syncActivity(); });
    gate.querySelector('button').addEventListener('click',function () { paused = false; canvas.focus(); syncActivity(); });
    loading.querySelector('a').addEventListener('click',function (event) { event.preventDefault(); window.location.reload(); });
    stage.addEventListener('contextmenu',function (event) { event.preventDefault(); });
    slot.replaceChildren(stage);
    activity = window.DemoActivity.create(stage); activity.onChange(syncActivity);
    window.addEventListener('resize',function () { resize(); syncActivity(); });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    if (coarse.addEventListener) coarse.addEventListener('change',syncActivity);
  }
  function boot() {
    var loader = document.createElement('script'); loader.src = build + '.loader.js' + version;
    loader.onerror = function () { error('Check your connection, then try again.'); };
    loader.onload = function () {
      resize();
      window.createUnityInstance(canvas,{
        dataUrl:build + '.data.unityweb' + version, frameworkUrl:build + '.framework.js.unityweb' + version,
        codeUrl:build + '.wasm.unityweb' + version, streamingAssetsUrl:'assets/one-shift-unity/StreamingAssets',
        companyName:'Ethan Willingham',productName:'Receiving practice',productVersion:'14',matchWebGLToCanvasSize:false,devicePixelRatio:1,
        onOneShiftStats:function () {},onWarehouseHUD:function () {},
        onOneShiftPreparation:function (completed,total,value) {
          if (value < 0) { error('Graphics could not be prepared. Try a browser with WebGL 2 enabled.'); return; }
          graphicsReady = value === 1; text(status,graphicsReady ? 'Your delivery is ready' : 'Preparing the receiving dock');
          progress.value = graphicsReady ? 100 : 90 + 10 * completed / Math.max(1,total); updateReady();
        },
        onWarehousePreparation:function (value) {
          if (typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { return; } }
          if (value && value.detail) text(detail,value.detail);
        },
        showBanner:function (message,type) { if (type === 'error') { console.error(message); error('The warehouse stopped while loading. Reload this page to try again.'); } }
      },function (fraction) { if (!graphicsReady) { progress.value = Math.round(fraction * 90); text(detail,'Loading the warehouse: ' + Math.round(fraction * 100) + '%. It stays loaded while you choose other lessons.'); } }).then(function (game) {
        instance = game;
        if (!game.Module || !game.Module.pauseMainLoop || !game.Module.resumeMainLoop || !game.Module.SetRefreshMonitorActive) { error('The warehouse activity controls could not start.'); return; }
        // The visitor may select a different lesson while the first download runs.
        var state = JSON.parse(JSON.stringify(currentState)); state.syncVersion = syncVersion;
        command('inbound-setup',JSON.stringify(state)); updateReady();
      }).catch(function (reason) { console.error(reason); error('Use a browser with WebGL 2 enabled, then try again.'); });
    };
    document.body.appendChild(loader);
  }
  window.InboundWarehouse = {
    mount:function (target,state,options) {
      slot = target; currentState = state; callbacks = options || {}; shown = true;
      if (!stage) { init(); synchronize(true); boot(); }
      else { slot.appendChild(stage); stage.hidden = false; synchronize(false); resize(); syncActivity(); }
    },
    park:function () {
      if (!stage) return;
      shown = false; stage.hidden = true; document.getElementById('inbound-app').appendChild(stage); syncActivity();
    },
    setModal:function (value) { modal = !!value; syncActivity(); },
    onScan:function (code) { if (allow() && callbacks.onScan) callbacks.onScan(code); },
    onSceneSynced:function (value) {
      if (typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { return; } }
      if (!value) return;
      if (value.error) { error(value.error); return; }
      if (value.syncVersion !== syncVersion) return;
      if (!value.sceneReady) { error('The delivery could not be prepared.'); return; }
      acknowledged = value.syncVersion;
      stage.dataset.physicalUnits = String(value.physicalUnits); stage.dataset.good = String(value.good); stage.dataset.damaged = String(value.damaged);
      stage.dataset.lesson = value.lesson; stage.dataset.sceneState = JSON.stringify(value);
      updateReady();
    },
    ready:function () { return allow(); }
  };
}());
