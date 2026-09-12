/* Presentation only. Preset controls and simulation stay in the demo host. */
(function () {
  'use strict';

  function init() {
    var toy = window.__toy;
    var shell = document.getElementById('toy');
    if (!toy || !shell || !document.getElementById('toy-fallback').hidden) return;
    var bar = document.getElementById('toy-bar');
    var pauseButton = document.getElementById('toy-pause');
    var resumeButton = document.getElementById('toy-resume');
    var fullButton = document.getElementById('toy-fullscreen');
    var hint = document.getElementById('toy-hint');
    var status = document.getElementById('toy-status');
    var openPanel = null;
    var opener = null;
    var hints = {
      poke: 'Drag a slime or stir the water.',
      water: 'Hold to pour. Drag to make a splash.',
      smoke: 'Hold and drag to send smoke swirling.',
      slime: 'Tap to drop a slime. Drag to place it.',
      draw: 'Drag to draw a wall. Everything feels it.',
      erase: 'Drag across a wall to let everything through.'
    };

    // Relocate the original buttons, preserving all preset handlers and values.
    var generated = bar.querySelector('.toy-presets');
    if (generated) {
      Array.from(generated.children).forEach(function (row) {
        var key = row.querySelector('[data-preset]').dataset.preset.split(':')[0];
        var material = key.replace(/Look|Scale/, '');
        row.querySelector('label').textContent = /Look$/.test(key) ? 'Appearance' : /Scale$/.test(key) ? 'Size & energy' : 'Behavior';
        bar.querySelector('[data-presets="' + material + '"]').appendChild(row);
      });
      generated.remove();
      var shape = document.getElementById('toy-shape');
      if (shape) {
        var shapeLabel = document.createElement('label');
        shapeLabel.className = 'toy-shape-label';
        shapeLabel.htmlFor = shape.id;
        shapeLabel.textContent = 'Next slime shape';
        shapeLabel.appendChild(shape);
        bar.querySelector('[data-presets="slime"]').appendChild(shapeLabel);
      }
    }

    function closePanel(returnFocus) {
      if (!openPanel) return;
      openPanel.hidden = true;
      opener.setAttribute('aria-expanded', 'false');
      if (returnFocus) opener.focus({ preventScroll: true });
      openPanel = opener = null;
    }

    bar.querySelectorAll('[data-panel]').forEach(function (button) {
      button.addEventListener('click', function () {
        var panel = document.getElementById('toy-panel-' + button.dataset.panel);
        var wasOpen = panel === openPanel;
        closePanel(false);
        if (wasOpen) return;
        openPanel = panel;
        opener = button;
        panel.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        var focus = panel.querySelector('[data-preset].is-on') || panel.querySelector('input') || panel.querySelector('button');
        if (focus) focus.focus({ preventScroll: true });
      });
    });
    bar.querySelectorAll('[data-close]').forEach(function (button) {
      button.addEventListener('click', function () { closePanel(true); });
    });
    document.addEventListener('pointerdown', function (event) {
      if (openPanel && !openPanel.contains(event.target) && !event.target.closest('[data-panel]')) closePanel(false);
    });
    document.addEventListener('focusin', function (event) {
      if (openPanel && !openPanel.contains(event.target) && !event.target.closest('[data-panel]')) closePanel(false);
    });

    function sync() {
      var state = toy.stats();
      shell.dataset.activeTool = state.tool;
      shell.classList.toggle('is-paused', state.paused);
      pauseButton.setAttribute('aria-pressed', String(state.paused));
      pauseButton.setAttribute('aria-label', state.paused ? 'Resume' : 'Pause');
      pauseButton.title = (state.paused ? 'Resume' : 'Pause') + ' (Space)';
      pauseButton.querySelector('path').setAttribute('d', state.paused ? 'm8 5 11 7-11 7Z' : 'M8 5v14M16 5v14');
      resumeButton.hidden = !state.paused;
      var label = state.paused ? 'Paused' : state.waterState === 'booting' ? 'Starting water' : 'Live';
      if (status.textContent !== label) status.textContent = label;
      var instruction = hints[state.tool] || hints.poke;
      if (hint.textContent !== instruction) hint.textContent = instruction;
      bar.querySelectorAll('[data-tool], [data-scene], [data-preset]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.classList.contains('is-on')));
      });
      bar.querySelectorAll('[data-panel="water"], [data-tool="water"]').forEach(function (button) {
        button.disabled = state.waterState === 'off';
      });
      ['water', 'smoke', 'slime'].forEach(function (material) {
        var selected = Array.from(bar.querySelectorAll('[data-presets="' + material + '"] .is-on'));
        var names = selected.map(function (button) { return button.textContent; }).join(' / ');
        bar.querySelector('[data-panel="' + material + '"]').title = material + ' presets: ' + names;
      });
    }

    function pause(value) {
      toy.pause(value);
      sync();
    }
    pauseButton.addEventListener('click', function () { pause(!toy.stats().paused); });
    resumeButton.addEventListener('click', function () { pause(false); document.getElementById('toy-input').focus({ preventScroll: true }); });
    document.getElementById('toy-restart').addEventListener('click', function () {
      toy.scene(toy.stats().scene);
      pause(false);
    });
    bar.addEventListener('click', function (event) {
      if (event.target.closest('[data-scene], #toy-clear')) pause(false);
    });

    function expanded() { return document.fullscreenElement === shell || shell.classList.contains('is-expanded'); }
    function syncFullscreen() {
      var active = expanded();
      fullButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
      fullButton.title = active ? 'Exit fullscreen (Esc)' : 'Fullscreen (F)';
      document.body.classList.toggle('toy-expanded', active);
      toy.resize();
    }
    async function toggleFullscreen() {
      closePanel(false);
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen();
      } else if (shell.classList.contains('is-expanded')) {
        shell.classList.remove('is-expanded');
      } else {
        try {
          if (!shell.requestFullscreen) throw new Error('Use in-page fullscreen');
          await shell.requestFullscreen();
        } catch (error) {
          shell.classList.add('is-expanded');
        }
      }
      syncFullscreen();
    }
    fullButton.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        if (openPanel) { event.preventDefault(); closePanel(true); }
        else if (shell.classList.contains('is-expanded')) { shell.classList.remove('is-expanded'); syncFullscreen(); fullButton.focus(); }
        return;
      }
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName) || event.target.isContentEditable) return;
      var bounds = shell.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > innerHeight) return;
      if (event.code === 'Space') { event.preventDefault(); pause(!toy.stats().paused); }
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFullscreen(); }
    });

    // Observe control changes, including number-key tool selection and presets
    // changed through the console. No additional animation loop is needed.
    var controls = new MutationObserver(sync);
    bar.querySelectorAll('[data-tool], [data-scene], [data-preset]').forEach(function (button) {
      controls.observe(button, { attributes: true, attributeFilter: ['class'] });
    });
    var readout = new MutationObserver(function () {
      var state = toy.stats();
      var label = state.paused ? 'Paused' : state.waterState === 'booting' ? 'Starting water' : 'Live';
      if (status.textContent !== label) sync();
    });
    readout.observe(document.getElementById('toy-readout'), { childList: true });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { toy.resize(); }).observe(shell);
    sync();
    toy.resize();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
