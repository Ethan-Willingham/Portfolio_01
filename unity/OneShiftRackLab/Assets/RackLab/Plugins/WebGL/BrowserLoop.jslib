mergeInto(LibraryManager.library, {
  WarehousePointerLocked: function () {
    return document.pointerLockElement === Module['canvas'] ? 1 : 0;
  },
  WarehouseInitialMode: function () {
    if (window.OneShiftShell && window.OneShiftShell.lesson) return 5;
    if (window.warehouseRequestedMode === 'demo') {
      return window.warehouseRequestedDemo === 'transfer' ? 3 : window.warehouseRequestedDemo === 'pick-ship' ? 4 : 2;
    }
    return window.warehouseRequestedMode === 'sandbox' ? 0 : 1;
  },
  WarehouseInitialInboundState__deps: ['malloc', '$lengthBytesUTF8', '$stringToUTF8'],
  WarehouseInitialInboundState: function () {
    var value = window.OneShiftShell && window.OneShiftShell.initialInboundState;
    var text = typeof value === 'string' ? value : JSON.stringify(value || null);
    var length = lengthBytesUTF8(text) + 1;
    var pointer = _malloc(length);
    stringToUTF8(text, pointer, length);
    return pointer;
  },
  WarehouseInboundScan: function (code) {
    var receiver = window.InboundWarehouse;
    if (receiver && typeof receiver.onScan === 'function') receiver.onScan(UTF8ToString(code));
  },
  WarehouseInboundSceneSynced: function (json) {
    var receiver = window.InboundWarehouse;
    if (receiver && typeof receiver.onSceneSynced === 'function') receiver.onSceneSynced(JSON.parse(UTF8ToString(json)));
  },
  OneShiftRegisterBrowserLoop__deps: ['emscripten_pause_main_loop', 'emscripten_resume_main_loop'],
  OneShiftRegisterBrowserLoop: function () {
    // Export the engine's own scheduling controls for the host page.
    // These do not replace window.requestAnimationFrame or browser timers.
    Module['pauseMainLoop'] = _emscripten_pause_main_loop;
    Module['resumeMainLoop'] = _emscripten_resume_main_loop;
  },
  OneShiftReportPlayerStats: function (version, framesPerSecond, longestFrameMs, frameCount) {
    if (typeof Module['onOneShiftStats'] === 'function')
      Module['onOneShiftStats'](version, framesPerSecond, longestFrameMs, frameCount);
  },
  OneShiftReportGraphicsPreparation: function (completed, total, ready) {
    if (typeof Module['onOneShiftPreparation'] === 'function')
      Module['onOneShiftPreparation'](completed, total, ready);
  },
  WarehouseReportPreparation: function (json) {
    if (typeof Module['onWarehousePreparation'] === 'function')
      Module['onWarehousePreparation'](UTF8ToString(json));
  },
  WarehouseReportHUD: function (json) {
    if (typeof Module['onWarehouseHUD'] === 'function')
      Module['onWarehouseHUD'](UTF8ToString(json));
  }
});
