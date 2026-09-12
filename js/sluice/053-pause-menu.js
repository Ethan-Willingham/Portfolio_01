  /* ---- Pause menu: material tokens, navigation, and native controls ---- */
  var pauseMenuPage = 'main';
  var pauseMenuShowPage = null;
  function pauseMenuBack() {
    if (pauseMenuPage === 'main' || !pauseMenuShowPage) return false;
    pauseMenuShowPage('main');
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
    var body = card.querySelector('.pause-body');
    var pages = card.querySelectorAll('[data-pause-page]');
    var titles = { main: 'Paused', options: 'Options', controls: 'Controls', restart: 'Start a new game?' };
    var returnFocus = 'gm-resume-btn';
    pauseMenuShowPage = function (page) {
      pauseMenuPage = page;
      card.setAttribute('data-page', page);
      for (var i = 0; i < pages.length; i++) pages[i].hidden = pages[i].getAttribute('data-pause-page') !== page;
      title.textContent = titles[page];
      back.hidden = page === 'main';
      save.hidden = page !== 'main';
      if (page === 'main') {
        // The status source retains its detailed wording for other callers.
        save.textContent = save.textContent
          .replace(/^autosave on, last saved /, 'Saved ')
          .replace(/^autosave on, saves when you dock at a town$/, 'Autosave on')
          .replace(/^autosave off .*$/, 'Autosave off')
          .replace(/^save failing, browser storage may be full$/, 'Save failed. Storage may be full.');
      }
      body.scrollTop = 0;
      var focus = page === 'main' ? document.getElementById(returnFocus) :
        page === 'restart' ? document.getElementById('gm-cancel-restart') : back;
      if (focus) focus.focus({ preventScroll: true });
    };
    function openWith(id, page) {
      document.getElementById(id).addEventListener('click', function () {
        returnFocus = id;
        pauseMenuShowPage(page);
      });
    }
    openWith('gm-options-btn', 'options');
    openWith('gm-controls-btn', 'controls');
    openWith('gm-new-game-btn', 'restart');
    back.addEventListener('click', pauseMenuBack);
    document.getElementById('gm-cancel-restart').addEventListener('click', pauseMenuBack);

    // Keep keyboard traversal on the visible page. The game key handler
    // leaves paused native controls alone, including range arrow keys.
    overlay.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') e.stopPropagation();
      if (e.key !== 'Tab') return;
      var controls = Array.prototype.filter.call(card.querySelectorAll('button, input'), function (el) {
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
      var siblings = area.children;
      for (var i = 0; i < siblings.length; i++) {
        if (siblings[i] !== overlay) siblings[i].inert = visible;
      }
      if (visible) {
        returnFocus = 'gm-resume-btn';
        pauseMenuShowPage('main');
      } else {
        pauseMenuPage = 'main';
        // Enter is also the shop key. Returning focus to a button would
        // let its native Enter click reopen pause instead of entering town.
        var target = document.getElementById('game-canvas');
        if (target) target.focus({ preventScroll: true });
      }
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });

    function read(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    }
    function setOpt(key, value) { window.SluiceOptions.set(key, value); }
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
      function sync(value) {
        for (var i = 0; i < pairs.length; i++) {
          var button = document.getElementById(pairs[i][0]);
          var selected = pairs[i][1] === value;
          button.classList.toggle('is-active', selected);
          button.setAttribute('aria-pressed', String(selected));
        }
        if (key === 'gfx') {
          document.getElementById('gm-gfx-note').textContent = {
            performance: 'Fewer effects, smoother play.',
            balanced: 'A balance of detail and performance.',
            extreme: 'All visual effects.'
          }[value];
        }
      }
      for (var i = 0; i < pairs.length; i++) {
        (function (pair) {
          document.getElementById(pair[0]).addEventListener('click', function () { setOpt(key, pair[1]); sync(pair[1]); });
        })(pairs[i]);
      }
      var saved = read('sluice.opt.' + key);
      var valid = pairs.some(function (pair) { return pair[1] === saved; });
      sync(key === 'banya' ? (ENABLE_BATH ? '1' : '0') : valid ? saved : fallback);
    }
    // Moderate for first-time players; a saved master mute still wins.
    wireSlider('gm-vol', null, 0.6, true);
    wireSlider('gm-musicvol', 'musicvol', 0.65, false);
    wireSlider('gm-sfxvol', 'sfxvol', 1, false);
    wireSlider('gm-shake', 'shake', 1, false);
    wireSegment('gfx', 'extreme', [['gm-gfx-perf', 'performance'], ['gm-gfx-bal', 'balanced'], ['gm-gfx-ext', 'extreme']]);
    wireSegment('dmgflash', '1', [['gm-dmgflash-off', '0'], ['gm-dmgflash-on', '1']]);
    wireSegment('lowflash', '0', [['gm-lowflash-off', '0'], ['gm-lowflash-on', '1']]);
    wireSegment('banya', ENABLE_BATH ? '1' : '0', [['gm-banya-off', '0'], ['gm-banya-on', '1']]);
  }
  setupPauseMenu();
