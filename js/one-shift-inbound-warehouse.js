(function () {
  'use strict';
  var instance, activity, stage, canvas, currentState, slot, loading, status, detail, progress, gate, orientationGate;
  var callbacks = {}, guide = {}, hud = {}, scene = {}, ready = false, graphicsReady = false, failed = false;
  var shown = false, modal = false, portrait = false, loopPaused = false, active = null;
  var inspecting = false, computerOpen = false, computerTransitioning = false, capturePending = false, triggerHeld = false, carryKeyHeld = false, escapeHandled = false;
  var lastLesson = '', lastSnapshot = '', syncVersion = 0, acknowledged = -1;
  var coarse = window.matchMedia('(pointer: coarse)');
  var build = 'assets/one-shift-unity/Build/OneShiftWeb', version = '?v=15';
  function text(node,value) { if (node && node.textContent !== value) node.textContent = value; }
  function command(action,value) { if (instance && !failed) instance.SendMessage('BrowserLifecycle','UICommand',JSON.stringify({action:action,value:value == null ? '' : String(value)})); }
  function unlocked() { return document.pointerLockElement !== canvas; }
  function unlock() { capturePending = false; if (!unlocked() && document.exitPointerLock) document.exitPointerLock(); }
  function floorAllowed() { return shown && ready && !failed && !portrait && !modal && !inspecting && !computerOpen && !computerTransitioning && activity.active(); }
  function setTrigger(value) { value = !!value; if (triggerHeld === value) return; triggerHeld = value; command('device-trigger',value ? '1' : '0'); }
  function resize() {
    if (!canvas || !stage || loopPaused) return;
    var rect = canvas.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return;
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
    document.querySelectorAll('#inbound-app dialog').forEach(function (dialog) { dialog.inert = portrait; });
    if (portrait && !orientationGate.open && orientationGate.showModal) orientationGate.showModal();
    else if (!portrait && orientationGate.open && orientationGate.close) orientationGate.close();
    var run = shown && !failed && !portrait && !modal && activity.active();
    stage.dataset.active = String(run); stage.dataset.locked = String(!unlocked());
    stage.dataset.interface = computerOpen ? 'computer' : inspecting ? 'scanner' : 'floor';
    gate.hidden = !ready || modal || inspecting || computerOpen || computerTransitioning || (!unlocked() && run);
    text(gate.querySelector('h2'),coarse.matches ? 'Play with a keyboard and mouse' : 'Step into the warehouse');
    text(gate.querySelector('p'),coarse.matches ? 'Connect a keyboard and mouse to walk, carry boxes and use the scanner.' : 'WASD or arrow keys to walk. Move the mouse to look. Escape opens the menu.');
    text(gate.querySelector('button'),'Start playing');
    if(stage.dataset.captureError) {
      text(gate.querySelector('h2'),'Mouse control did not start');
      text(gate.querySelector('p'),'Try again. If this browser still cannot capture the mouse, open this page in Chrome or Edge to play.');
      text(gate.querySelector('button'),'Try again');
    }
    if (!run) { setTrigger(false); carryKeyHeld = false; unlock(); }
    if (callbacks.onAvailability) callbacks.onAvailability(ready && run);
    if (!instance || !instance.Module || !instance.Module.SetRefreshMonitorActive || !instance.Module.pauseMainLoop || !instance.Module.resumeMainLoop || run === active) return;
    active = run;
    if (run) {
      if (loopPaused) { instance.Module.SetRefreshMonitorActive(true); instance.Module.resumeMainLoop(); loopPaused = false; }
      resize(); instance.SendMessage('BrowserLifecycle','SetBrowserActive','1');
    } else {
      instance.SendMessage('BrowserLifecycle','SetBrowserActive','0');
      instance.Module.SetRefreshMonitorActive(false); instance.Module.pauseMainLoop(); loopPaused = true;
    }
  }
  function capture() {
    if (!floorAllowed()) return;
    canvas.focus({preventScroll:true});
    if (!capturePending && unlocked() && canvas.requestPointerLock) {
      capturePending = true;
      try { var request = canvas.requestPointerLock(); if (request && request.then) request.then(function () { capturePending = false; stage.dataset.captureError = ''; },function (reason) { capturePending = false; stage.dataset.captureError = String(reason && reason.message || 'Mouse capture unavailable'); syncActivity(); }); }
      catch (reason) { capturePending = false; stage.dataset.captureError = String(reason && reason.message || 'Mouse capture unavailable'); syncActivity(); }
    }
    command('resume');
  }
  function error(message) {
    failed = true; ready = false; stage.dataset.ready = 'false'; loading.hidden = false;
    text(status,'The warehouse could not open'); text(detail,message); progress.hidden = true;
    loading.querySelector('a').hidden = false; syncActivity();
  }
  function updateReady() {
    var before = ready;
    ready = !!instance && graphicsReady && acknowledged === syncVersion && !failed;
    stage.dataset.ready = String(ready); loading.hidden = ready; syncActivity();
    if (ready && !before && callbacks.onReady) callbacks.onReady();
  }
  function synchronize(force,reset) {
    if (!currentState) return;
    var value = Object.assign({},currentState,{guideTitle:guide.title || '',guideInstruction:guide.instruction || ''});
    var json = JSON.stringify(value);
    if (!force && !reset && json === lastSnapshot) { syncActivity(); return; }
    var setup = reset || lastLesson !== currentState.scenario.id;
    lastLesson = currentState.scenario.id; lastSnapshot = json; value.syncVersion = ++syncVersion;
    window.OneShiftShell = {lesson:value.scenario.id,initialInboundState:value};
    if (instance) command(setup ? 'inbound-setup' : 'inbound-sync',JSON.stringify(value));
    updateReady();
  }
  function focusDevice() {
    if (!ready || modal || portrait || !shown || computerOpen || computerTransitioning || hud.holding || carryKeyHeld) return;
    if (currentState.scenario.channel === 'web') { if (callbacks.onNotice) callbacks.onNotice('Walk to the office computer and press E at its screen.'); return; }
    setTrigger(false); inspecting = true; command('device-equip','1'); command('device-focus','1'); unlock();
    if (callbacks.onDevice) callbacks.onDevice(true,false); syncActivity();
  }
  function closeDevice(resume) {
    var wasComputer = computerOpen;
    inspecting = false;
    if (wasComputer) { computerOpen = false; computerTransitioning = true; }
    else command('device-focus','0');
    if (callbacks.onDevice) callbacks.onDevice(false,wasComputer);
    syncActivity();
    // Capture belongs to this trusted button/key event, never a delayed Unity callback.
    if (resume && shown && !modal && !portrait && activity.active()) {
      canvas.focus({preventScroll:true});
      if (wasComputer) {
        try { var request = canvas.requestPointerLock && canvas.requestPointerLock(); if (request && request.catch) request.catch(function () {}); } catch (_) {}
      } else capture();
    }
    if (wasComputer) command('computer-close');
  }
  function onHUD(value) {
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch (_) { return; } }
    if (!value) return;
    hud = value;
    var wasOpen = computerOpen;
    computerOpen = !!(value.computer && value.computer.open);
    computerTransitioning = !!(value.computer && value.computer.transitioning);
    if (computerOpen && !wasOpen) { setTrigger(false); inspecting = false; unlock(); if (callbacks.onDevice) callbacks.onDevice(true,true); }
    if (!computerOpen && wasOpen && callbacks.onDevice) callbacks.onDevice(false,true);
    stage.dataset.hud = JSON.stringify(value);
    if (shown && callbacks.onHUD) callbacks.onHUD(value);
    syncActivity();
  }
  function init() {
    stage = document.createElement('section'); stage.className = 'in-warehouse-stage'; stage.setAttribute('aria-label','Playable receiving warehouse');
    stage.innerHTML = '<canvas id="in-warehouse-canvas" width="1280" height="720" tabindex="0" aria-label="Warehouse game. WASD or arrow keys to walk, mouse to look, hold E to carry a carton, left mouse to scan, right mouse to inspect the handheld. Escape opens the menu."></canvas>' +
      '<div class="in-warehouse-loading"><h2 id="in-load-status" role="status">Opening the warehouse</h2><progress max="100" value="0" aria-labelledby="in-load-status"></progress><p class="in-load-detail">The game loads once. Other receiving lessons reuse it.</p><a href="one-shift.html" hidden>Reload this page to try again</a></div>' +
      '<div class="in-warehouse-gate" hidden><h2>Step into the warehouse</h2><p>WASD or arrow keys to walk. Move the mouse to look.</p><button type="button">Start playing</button></div>';
    canvas = stage.querySelector('canvas'); loading = stage.querySelector('.in-warehouse-loading'); status = loading.querySelector('h2'); detail = loading.querySelector('p'); progress = loading.querySelector('progress'); gate = stage.querySelector('.in-warehouse-gate');
    orientationGate = document.createElement('dialog'); orientationGate.className = 'in-orientation-gate'; orientationGate.hidden = true;
    orientationGate.innerHTML = '<h1>Turn your screen sideways</h1><p>Your warehouse will wait.</p>'; document.body.appendChild(orientationGate);
    orientationGate.addEventListener('cancel',function (event) { event.preventDefault(); });
    gate.querySelector('button').addEventListener('click',capture);
    loading.querySelector('a').addEventListener('click',function (event) { event.preventDefault(); window.location.reload(); });
    canvas.addEventListener('contextmenu',function (event) { event.preventDefault(); });
    canvas.addEventListener('mousedown',function (event) {
      if (!floorAllowed()) return;
      if (unlocked()) { if (event.button === 0) capture(); return; }
      if (event.button === 2) { if (!hud.holding && !carryKeyHeld) focusDevice(); }
      else if (event.button === 0 && !(hud.inbound && hud.inbound.scannerEquipped === false)) setTrigger(true);
    });
    window.addEventListener('mouseup',function (event) { if (event.button === 0) setTrigger(false); });
    window.addEventListener('blur',function () { capturePending = false; carryKeyHeld = false; setTrigger(false); });
    document.addEventListener('pointerlockchange',function () { capturePending = false; if (unlocked()) setTrigger(false); else if (floorAllowed()) command('resume'); syncActivity(); });
    document.addEventListener('pointerlockerror',function () { capturePending = false; setTrigger(false); syncActivity(); });
    window.addEventListener('keydown',function (event) {
      if (!shown || !ready) return;
      if (portrait) { if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); } return; }
      var editing = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName);
      if (event.code === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.repeat) return;
        escapeHandled = true;
        if (inspecting || computerOpen) closeDevice(true);
        else if (callbacks.onMenu) callbacks.onMenu();
        return;
      }
      if (editing || modal || inspecting || computerOpen || event.repeat) return;
      if (event.code === 'KeyE') carryKeyHeld = true;
      if (event.code === 'KeyH') { event.preventDefault(); if (callbacks.onHelp) callbacks.onHelp(); }
      if (!floorAllowed() || unlocked()) return;
      if (event.code === 'KeyQ') { event.preventDefault(); setTrigger(false); command('device-equip',hud.inbound && hud.inbound.scannerEquipped === false ? '1' : '0'); }
      else if (event.code === 'KeyF') { event.preventDefault(); command('device-scan'); }
      else if (event.code === 'Tab') { event.preventDefault(); focusDevice(); }
    },true);
    window.addEventListener('keyup',function (event) {
      if (event.code === 'KeyE') carryKeyHeld = false;
      if (shown && ready && !portrait && event.code === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!escapeHandled) { if (inspecting || computerOpen) closeDevice(true); else if (callbacks.onMenu) callbacks.onMenu(); }
        escapeHandled = false;
      }
    },true);
    slot.replaceChildren(stage); activity = window.DemoActivity.create(stage); activity.onChange(syncActivity);
    window.addEventListener('resize',function () { resize(); syncActivity(); });
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
    if (coarse.addEventListener) coarse.addEventListener('change',syncActivity);
  }
  function boot() {
    var loader = document.createElement('script'); loader.src = build + '.loader.js' + version;
    loader.onerror = function () { error('Check your connection, then reload this page.'); };
    loader.onload = function () {
      resize();
      window.createUnityInstance(canvas,{
        dataUrl:build+'.data.unityweb'+version,frameworkUrl:build+'.framework.js.unityweb'+version,codeUrl:build+'.wasm.unityweb'+version,
        streamingAssetsUrl:'assets/one-shift-unity/StreamingAssets',companyName:'Ethan Willingham',productName:'Receiving practice',productVersion:'15',matchWebGLToCanvasSize:false,devicePixelRatio:1,
        onOneShiftStats:function (version,fps,longest,frames) { stage.dataset.buildVersion=String(version); stage.dataset.frames=String(frames); },onWarehouseHUD:onHUD,
        onOneShiftPreparation:function (completed,total,value) { if(value<0){error('Graphics could not be prepared. Try a browser with WebGL 2 enabled.');return;} graphicsReady=value===1; text(status,graphicsReady?'Your warehouse is ready':'Preparing the warehouse'); progress.value=graphicsReady?100:90+10*completed/Math.max(1,total);updateReady(); },
        onWarehousePreparation:function (value) { if(typeof value==='string'){try{value=JSON.parse(value);}catch(_){return;}} if(value&&value.detail)text(detail,value.detail); },
        showBanner:function (message,type) { if(type==='error'){console.error(message);error('The game stopped while loading. Reload this page to try again.');} }
      },function (fraction) { if(!graphicsReady){progress.value=Math.round(fraction*90);text(detail,'Loading the warehouse: '+Math.round(fraction*100)+'%. It stays ready between lessons.');} }).then(function (game) {
        instance=game;
        if(!game.Module||!game.Module.pauseMainLoop||!game.Module.resumeMainLoop||!game.Module.SetRefreshMonitorActive){error('The game activity controls could not start.');return;}
        command('inbound-setup',JSON.stringify(window.OneShiftShell.initialInboundState)); updateReady();
      }).catch(function (reason) { console.error(reason);error('Use a browser with WebGL 2 enabled, then reload this page.'); });
    };
    document.body.appendChild(loader);
  }
  window.InboundWarehouse = {
    mount:function (target,state,options) { slot=target;currentState=state;callbacks=options||{};guide=callbacks.guide||{};shown=true; if(!stage){init();synchronize(true,true);boot();}else{slot.replaceChildren(stage);stage.hidden=false;synchronize(false,false);resize();syncActivity();} },
    update:function (state,value,reset) { currentState=state;guide=value||guide;synchronize(false,!!reset); },
    park:function () { if(!stage)return;shown=false;setTrigger(false);command('inbound-leave');inspecting=false;computerOpen=false;computerTransitioning=false;modal=false;stage.hidden=true;document.getElementById('inbound-app').appendChild(stage);syncActivity(); },
    setModal:function (value) { modal=!!value;syncActivity(); },
    play:capture, openDevice:focusDevice, closeDevice:closeDevice,
    feedback:function (success,message) { command('inbound-feedback',JSON.stringify({success:!!success,message:message})); },
    checkReceiving:function () { if(!ready||!shown||failed||portrait||modal||!activity.active())return false;command('inbound-report');return !!scene.allDeliveredAtReceiving && !hud.holding; },
    onScan:function (code) { if(floorAllowed() && callbacks.onScan)callbacks.onScan(code); },
    onSceneSynced:function (value) {
      if(typeof value==='string'){try{value=JSON.parse(value);}catch(_){return;}} if(!value)return;
      if(value.error){error(value.error);return;} if(value.syncVersion!==syncVersion)return;
      if(!value.sceneReady){error('The delivery could not be prepared.');return;}
      scene=value;acknowledged=value.syncVersion;stage.dataset.sceneState=JSON.stringify(value);stage.dataset.lesson=value.lesson;stage.dataset.good=String(value.good);stage.dataset.damaged=String(value.damaged);stage.dataset.physicalUnits=String(value.physicalUnits);updateReady();
    },
    ready:function () { return ready && shown && !failed && !portrait && !modal && activity.active(); }
  };
}());
