mergeInto(LibraryManager.library, {
  OneShiftRegisterBrowserLoop__deps: ['emscripten_pause_main_loop', 'emscripten_resume_main_loop'],
  OneShiftRegisterBrowserLoop: function () {
    // Export the engine's own scheduling controls for the host page.
    // These do not replace window.requestAnimationFrame or browser timers.
    Module['pauseMainLoop'] = _emscripten_pause_main_loop;
    Module['resumeMainLoop'] = _emscripten_resume_main_loop;
  }
});
