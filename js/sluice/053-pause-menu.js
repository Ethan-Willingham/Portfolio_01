  /* ---- Pause menu: material tokens, navigation, and native controls ---- */
  var pauseMenuPage = 'main';
  var pauseMenuShowPage = null;
  function pauseMenuBack() {
    if (pauseMenuPage === 'main' || !pauseMenuShowPage) return false;
    pauseMenuShowPage(pauseMenuPage === 'exhaust' ? 'options' : 'main');
    return true;
  }
  function setupPauseMenu() {
    var overlay = document.getElementById('game-pause');
    var card = document.getElementById('gm-pause-card');
    if (!overlay || !card) return;
    var area = overlay.parentNode;
    var colors = {
      panel: UIT_PANEL, selected: UIT_PANEL_SEL, inset: UIT_INSET,
      edge: UIT_EDGE, text: UIT_TEXT, body: UIT_BODY, dim: UIT_DIM,
      gold: UIT_GOLD, 'gold-hi': UIT_GOLD_HI, 'gold-text': UIT_GOLD_TEXT,
      red: UIT_RED, highlight: UIMAT_PLATE_HIGHLIGHT, weld: UIMAT_WELD
    };
    for (var color in colors) area.style.setProperty('--menu-' + color, colors[color]);
    var title = document.getElementById('gm-menu-title');
    var back = document.getElementById('gm-opt-back');
    var save = document.getElementById('gm-pause-save');
    var footer = card.querySelector('.pause-footer');
    var body = card.querySelector('.pause-body');
    var pages = card.querySelectorAll('[data-pause-page]');
    var titles = { main: 'Paused', options: 'Options', exhaust: 'Exhaust', controls: 'Controls', loading: 'Loading report', restart: 'Start a new game?' };
    var returnFocus = 'gm-resume-btn';
    pauseMenuShowPage = function (page) {
      var previousPage = pauseMenuPage;
      pauseMenuPage = page;
      card.setAttribute('data-page', page);
      for (var i = 0; i < pages.length; i++) pages[i].hidden = pages[i].getAttribute('data-pause-page') !== page;
      title.textContent = titles[page];
      back.hidden = page === 'main';
      back.setAttribute('aria-label', page === 'exhaust' ? 'Back to options' : 'Back to pause menu');
      save.hidden = page !== 'main';
      footer.hidden = page !== 'main';
      if (page === 'main') {
        // The status source retains its detailed wording for other callers.
        save.textContent = save.textContent
          .replace(/^autosave on, last saved /, 'Saved ')
          .replace(/^autosave on, saves when you dock at a town$/, 'Autosave on')
          .replace(/^autosave off .*$/, 'Autosave off')
          .replace(/^save failing, browser storage may be full$/, 'Save failed. Storage may be full.');
      }
      if (page === 'exhaust') syncExhaust();
      if (page === 'loading' && window.SluiceLoading) window.SluiceLoading.renderReport();
      body.scrollTop = 0;
      var focus = page === 'main' ? document.getElementById(returnFocus) :
        page === 'options' && previousPage === 'exhaust' ? document.getElementById('gm-exhaust-btn') :
        page === 'restart' ? document.getElementById('gm-cancel-restart') : back;
      if (focus) focus.focus({ preventScroll: true });
    };
    function openWith(id, page) {
      document.getElementById(id).addEventListener('click', function () {
        if (pauseMenuPage === 'main') returnFocus = id;
        pauseMenuShowPage(page);
      });
    }
    openWith('gm-options-btn', 'options');
    openWith('gm-exhaust-btn', 'exhaust');
    openWith('gm-controls-btn', 'controls');
    openWith('gm-loading-report-btn', 'loading');
    openWith('gm-new-game-btn', 'restart');
    back.addEventListener('click', pauseMenuBack);
    document.getElementById('gm-menu-close').addEventListener('click', function () {
      // Closing any page resumes through the existing safe Resume action.
      document.getElementById('gm-resume-btn').click();
    });
    document.getElementById('gm-cancel-restart').addEventListener('click', pauseMenuBack);

    // Keep keyboard traversal on the visible page. The game key handler
    // leaves paused native controls alone, including range arrow keys.
    overlay.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') e.stopPropagation();
      if (e.key !== 'Tab') return;
      var controls = Array.prototype.filter.call(card.querySelectorAll('button, input, pre[tabindex]'), function (el) {
        return !el.disabled && el.getClientRects().length > 0;
      });
      if (!controls.length) return;
      var index = controls.indexOf(document.activeElement);
      if ((e.shiftKey && index <= 0) || (!e.shiftKey && (index < 0 || index === controls.length - 1))) {
        e.preventDefault();
        controls[e.shiftKey ? controls.length - 1 : 0].focus();
      }
    });
    // The overlay lives inside the game's touch-action:none stage. Enable
    // native vertical scrolling only while paused, then restore the stage.
    var wasVisible = false;
    new MutationObserver(function () {
      var visible = overlay.classList.contains('is-visible');
      if (visible === wasVisible) return;
      wasVisible = visible;
      area.style.touchAction = visible ? 'auto' : '';
      var loading = window.SluiceLoading && window.SluiceLoading.active();
      if (window.SluiceLoading) window.SluiceLoading.syncInput();
      else {
        var siblings = area.children;
        for (var i = 0; i < siblings.length; i++) {
          if (siblings[i] !== overlay) siblings[i].inert = visible;
        }
      }
      if (visible) {
        returnFocus = 'gm-resume-btn';
        pauseMenuShowPage('main');
      } else {
        pauseMenuPage = 'main';
        // Enter is also the shop key. Returning focus to a button would
        // let its native Enter click reopen pause instead of entering town.
        var target = document.getElementById('game-canvas');
        if (target && !loading) target.focus({ preventScroll: true });
      }
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });

    function read(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function setOpt(key, value) { window.SluiceOptions.set(key, value); }
    var exhaustControls = card.querySelectorAll('[data-exhaust-group]');
    var exhaustRestore = document.getElementById('gm-exhaust-restore');
    function syncExhaust() {
      var settings = typeof rigExhaustSettings === 'function' ? rigExhaustSettings() : null;
      var stock = !settings || settings.id === 'stock';
      document.getElementById('gm-exhaust-name').textContent = settings ? settings.name : 'Stock exhaust';
      document.getElementById('gm-exhaust-description').textContent = settings ? settings.description : "The rig's original gold exhaust.";
      document.getElementById('gm-exhaust-note').textContent = stock ?
        'Buy and equip a smoke recipe in Store > Exhaust to adjust its appearance.' :
        'Changes are saved separately for each exhaust. Resume to see them in motion.';
      for (var i = 0; i < exhaustControls.length; i++) {
        var slider = exhaustControls[i];
        var group = slider.getAttribute('data-exhaust-group');
        var key = slider.getAttribute('data-exhaust-key');
        var value = settings && settings[group] ? Number(settings[group][key]) : Number(slider.defaultValue);
        if (!isFinite(value)) value = Number(slider.defaultValue);
        slider.value = value;
        slider.disabled = stock;
        var percent = Math.round(value * 100);
        var label = key === 'lifetime' ? value.toFixed(1) + 'x' :
          key === 'sharpness' && value === 0 ? 'Soft' :
          key === 'sharpness' && value === 1 ? 'Crisp' : percent + '%';
        document.getElementById(slider.id + '-value').value = stock ? '-' : label;
        slider.setAttribute('aria-valuetext', stock ? 'Equip a smoke recipe to adjust' :
          key === 'lifetime' ? value.toFixed(1) + ' times the original duration' :
          key === 'sharpness' ? percent + ' percent edge definition' : percent + ' percent');
      }
      exhaustRestore.disabled = stock;
    }
    for (var exhaustIndex = 0; exhaustIndex < exhaustControls.length; exhaustIndex++) {
      exhaustControls[exhaustIndex].addEventListener('input', function () {
        rigExhaustSetSetting(this.getAttribute('data-exhaust-group'), this.getAttribute('data-exhaust-key'), Number(this.value));
        syncExhaust();
      });
      exhaustControls[exhaustIndex].addEventListener('change', function () {
        rigExhaustFlushSettings();
      });
    }
    exhaustRestore.addEventListener('click', function () {
      rigExhaustRestoreSettings();
      syncExhaust();
    });
    function wireSlider(id, key, fallback, master) {
      var slider = document.getElementById(id);
      var output = document.getElementById(id + '-value');
      var saved = parseFloat(read(master ? 'sluice.volume' : 'sluice.opt.' + key));
      slider.value = Math.round(Math.max(0, Math.min(1, isNaN(saved) ? fallback : saved)) * 100);
      function sync() {
        output.value = slider.value + '%';
        slider.setAttribute('aria-valuetext', slider.value + ' percent');
      }
      function apply() {
        var value = Number(slider.value) / 100;
        if (master) {
          if (window.SluiceAudio) window.SluiceAudio.setVolume(value);
          try { localStorage.setItem('sluice.volume', String(value)); } catch (e) {}
        } else setOpt(key, value);
        sync();
      }
      sync();
      // Audio loads before the game bundle; keep the returning master level.
      if (master && window.SluiceAudio) window.SluiceAudio.setVolume(Number(slider.value) / 100);
      slider.addEventListener('input', apply);
    }
    function wireSegment(key, fallback, pairs) {
      function valid(value) {
        return pairs.some(function (pair) { return pair[1] === value; });
      }
      function sync(value) {
        for (var i = 0; i < pairs.length; i++) {
          var button = document.getElementById(pairs[i][0]);
          var selected = pairs[i][1] === value;
          button.classList.toggle('is-active', selected);
          button.setAttribute('aria-pressed', String(selected));
        }
        if (key === 'gfx') {
          document.getElementById('gm-gfx-note').textContent = {
            performance: 'Lower image resolution and lighter effects for more frame-rate headroom.',
            balanced: 'Full-size game image, with lighter smoke and terrain detail.',
            extreme: 'Maximum image and effect detail. Requires more graphics headroom.'
          }[value] || 'Custom graphics settings.';
        }
        if (key === 'rain') {
          document.getElementById('gm-ponds-note').textContent = pondsNote(read('sluice.opt.ponds') || 'regular');
          document.getElementById('gm-rain-note').textContent =
            (value === 'snow' ? 'Soft flakes settle into powder. Drive, scoop or blast through it; thaw feeds the lakes.' :
             'Passing showers feed three small stone-lined lakes. New lakes start low.') +
            ' Next new game. This world: ' + (worldSnowEnabled ? 'snow.' : worldRainEnabled ? 'rain.' : 'off.');
        }
        if (key === 'ponds') document.getElementById('gm-ponds-note').textContent = pondsNote(value);
      }
      for (var i = 0; i < pairs.length; i++) {
        (function (pair) {
          document.getElementById(pair[0]).addEventListener('click', function () { setOpt(key, pair[1]); sync(pair[1]); });
        })(pairs[i]);
      }
      var saved = read('sluice.opt.' + key);
      if (key === 'gfx') window.SluiceOptions.syncGraphics = sync;
      sync(key === 'banya' ? (ENABLE_BATH ? '1' : '0') : valid(saved) ? saved : fallback);
      return function () {
        var now = read('sluice.opt.' + key);
        sync(valid(now) ? now : fallback);
      };
    }
    // Ponds shape the next generated world, not the one in play, so the note
    // says whether this world already has the chosen ponds.
    function pondsNote(value) {
      var looks = {
        regular: 'Small stone-lined ponds.',
        wide: 'Huge ponds, two tiles deep and very wide. Heavier on graphics.',
        deep: 'Narrow ponds, 13 to 16 tiles deep. Heavier on graphics.'
      };
      if (worldRainEnabled || window.SluiceOptions.particleRain) return (looks[value] || looks.regular) + ' Particle weather uses three small lakes instead.';
      var current = looks[worldPondStyle] ? worldPondStyle : 'regular';
      return (looks[value] || looks.regular) +
        (value === current ? ' This world has them.' : ' Applies to your next new game.');
    }
    // Moderate for first-time players; a saved master mute still wins.
    wireSlider('gm-vol', null, 0.6, true);
    wireSlider('gm-musicvol', 'musicvol', 0.65, false);
    wireSlider('gm-sfxvol', 'sfxvol', 1, false);
    wireSlider('gm-shake', 'shake', 1, false);
    wireSegment('gfx', isMobile ? 'balanced' : 'extreme', [['gm-gfx-perf', 'performance'], ['gm-gfx-bal', 'balanced'], ['gm-gfx-ext', 'extreme']]);
    wireSegment('dmgflash', '1', [['gm-dmgflash-off', '0'], ['gm-dmgflash-on', '1']]);
    wireSegment('lowflash', '0', [['gm-lowflash-off', '0'], ['gm-lowflash-on', '1']]);
    wireSegment('banya', ENABLE_BATH ? '1' : '0', [['gm-banya-off', '0'], ['gm-banya-on', '1']]);
    var resyncRain = wireSegment('rain', '0', [['gm-rain-off', '0'], ['gm-rain-on', '1'], ['gm-snow-on', 'snow']]);
    document.getElementById('gm-options-btn').addEventListener('click', resyncRain);
    var resyncPonds = wireSegment('ponds', 'regular', [['gm-ponds-regular', 'regular'], ['gm-ponds-wide', 'wide'], ['gm-ponds-deep', 'deep']]);
    // A new game or a loaded save changes this world's ponds after the menu
    // was built, so the note refreshes whenever Options opens.
    document.getElementById('gm-options-btn').addEventListener('click', resyncPonds);
    wireSegment('heavysmoke', '0', [['gm-heavysmoke-off', '0'], ['gm-heavysmoke-on', '1']]);
  }
  setupPauseMenu();
