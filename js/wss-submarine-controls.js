/* Submarine controls share the host's UI tick and activity lifecycle. */
(function (root) {
  'use strict';

  function text(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function create(toy, shell) {
    if (!toy.submarine || !toy.submarineInput) return null;
    var viewport = shell.querySelector('#toy-viewport');
    if (!viewport) return null;
    var box = document.createElement('aside');
    box.id = 'toy-submarine-controls';
    box.className = 'toy-submarine-controls';
    box.hidden = true;
    box.setAttribute('aria-labelledby', 'submarine-heading');
    box.innerHTML = `
      <div class="submarine-heading"><h2 id="submarine-heading">Pilot the slime</h2><span id="submarine-state"></span></div>
      <p class="submarine-task">Steer through rings 1, 2 and 3.</p>
      <div class="submarine-directions" role="group" aria-label="Steer the submarine" aria-describedby="submarine-hold-help">
        <button type="button" data-submarine-direction="left" aria-pressed="false" aria-keyshortcuts="A" title="Hold A to steer left"><span>Left</span><kbd aria-hidden="true">A</kbd></button>
        <button type="button" data-submarine-direction="right" aria-pressed="false" aria-keyshortcuts="D" title="Hold D to steer right"><span>Right</span><kbd aria-hidden="true">D</kbd></button>
        <button type="button" data-submarine-direction="up" aria-pressed="false" aria-keyshortcuts="W" title="Hold W to rise"><span>Rise</span><kbd aria-hidden="true">W</kbd></button>
        <button type="button" data-submarine-direction="down" aria-pressed="false" aria-keyshortcuts="S" title="Hold S to dive"><span>Dive</span><kbd aria-hidden="true">S</kbd></button>
      </div>
      <p id="submarine-hold-help" class="submarine-accessible-help">Hold a direction to steer. Release to stop thrust. With assistive technology, activate a direction to start and activate it again to stop. Escape stops all thrust.</p>
      <div class="submarine-readings">
        <div><span>Depth</span><output id="submarine-depth" aria-live="off">0%</output></div>
        <div><span>Ballast</span><output id="submarine-fill" aria-live="off">0%</output></div>
      </div>
      <div class="submarine-fill-track" aria-hidden="true"><i id="submarine-fill-bar"></i></div>
      <button id="submarine-valve" class="submarine-valve" type="button" aria-pressed="false" aria-keyshortcuts="B" aria-describedby="submarine-ballast-help"><span id="submarine-valve-label">Open ballast</span><kbd aria-hidden="true">B</kbd></button>
      <p id="submarine-ballast-help" class="submarine-ballast-help">Ballast stays trapped while closed.</p>
      <div class="submarine-course"><p id="submarine-course" role="status" aria-live="polite" aria-atomic="true">0 / 3 rings</p><button id="submarine-course-reset" type="button">Restart course</button></div>
      <p class="submarine-help">WASD to steer. B opens ballast. Drag the hull to stretch it.</p>`;
    viewport.appendChild(box);
    function el(id) { return box.querySelector('#submarine-' + id); }
    var directions = ['left', 'right', 'up', 'down'];
    var buttons = {};
    var sources = new Map();
    var pointers = new Map();
    var applied = { left: false, right: false, up: false, down: false };
    var live = false;
    var model = null;
    var valve = el('valve');
    var restart = el('course-reset');
    var keyDirections = { a: 'left', d: 'right', w: 'up', s: 'down' };

    function current() {
      var state = toy.stats();
      var run = state.scene === 'slime-submarine' && !state.loading ? toy.submarine() : null;
      var sample = run && run.stats();
      var valid = !!(sample && sample.ready && !sample.error && !document.hidden);
      return { state: state, run: run, sample: sample, valid: valid, ready: valid && !state.paused };
    }
    function applyInputs() {
      directions.forEach(function (name) {
        var on = false;
        sources.forEach(function (direction) { if (direction === name) on = true; });
        if (on !== applied[name]) {
          applied[name] = on;
          toy.submarineInput(name, on);
        }
        buttons[name].setAttribute('aria-pressed', String(on));
      });
    }
    function start(source, direction) {
      if (!current().ready) return false;
      sources.set(source, direction);
      applyInputs();
      return true;
    }
    function stop(source) {
      sources.delete(source);
      applyInputs();
    }
    function release() {
      sources.clear();
      var captures = Array.from(pointers.entries());
      pointers.clear();
      // Clear the model even when the host already canceled its held inputs.
      directions.forEach(function (name) {
        applied[name] = false;
        toy.submarineInput(name, false);
        buttons[name].setAttribute('aria-pressed', 'false');
      });
      captures.forEach(function (entry) {
        if (entry[1].hasPointerCapture(entry[0])) entry[1].releasePointerCapture(entry[0]);
      });
    }
    function endPointer(event) {
      var button = pointers.get(event.pointerId);
      if (!button) return;
      pointers.delete(event.pointerId);
      stop('pointer:' + event.pointerId);
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    }
    box.querySelectorAll('[data-submarine-direction]').forEach(function (button) {
      var direction = button.dataset.submarineDirection;
      buttons[direction] = button;
      button.setAttribute('aria-describedby', 'submarine-hold-help');
      button.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || button.disabled || pointers.has(event.pointerId)) return;
        event.preventDefault();
        if (event.pointerType !== 'touch') button.focus({ preventScroll: true });
        if (!start('pointer:' + event.pointerId, direction)) return;
        pointers.set(event.pointerId, button);
        button.setPointerCapture(event.pointerId);
      });
      button.addEventListener('pointerup', endPointer);
      button.addEventListener('pointercancel', function (event) {
        if (pointers.has(event.pointerId)) release();
      });
      button.addEventListener('lostpointercapture', function (event) {
        // A normal release removed its pointer first. Unexpected capture loss
        // cancels the whole gesture so another finger cannot leave thrust on.
        if (pointers.has(event.pointerId)) release();
      });
      button.addEventListener('keydown', function (event) {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (!event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) start('button:' + direction + ':' + event.key, direction);
      });
      button.addEventListener('keyup', function (event) {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        stop('button:' + direction + ':' + event.key);
      });
      button.addEventListener('blur', function () {
        stop('button:' + direction + ': ');
        stop('button:' + direction + ':Enter');
        stop('click:' + direction);
      });
      button.addEventListener('contextmenu', function (event) { event.preventDefault(); });
      button.addEventListener('click', function (event) {
        // Pointer and keyboard holds handle their own press/release. A virtual
        // click from assistive technology can latch and then unlatch a motor.
        if (event.detail !== 0 || button.disabled) return;
        var source = 'click:' + direction;
        if (sources.has(source)) stop(source); else start(source, direction);
      });
    });
    valve.addEventListener('click', function () {
      if (!current().valid || valve.disabled) return;
      toy.submarineValve();
      sync();
    });
    restart.addEventListener('click', function () {
      if (!current().valid) return;
      release();
      toy.submarineCourse();
      sync();
    });

    function editing(target) {
      return !!(target && (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]')));
    }
    window.addEventListener('keydown', function (event) {
      var state = toy.stats();
      if (state.scene !== 'slime-submarine' || event.defaultPrevented || editing(event.target)) return;
      if (event.key === 'Escape' && sources.size) {
        event.preventDefault();
        release();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      var key = event.key.toLowerCase();
      if (!keyDirections[key] && key !== 'b') return;
      // Menus and dialogs keep their own keyboard behavior.
      if (event.target.closest('.toy-panel, .toy-scene-picker, a') || !(key === 'b' ? current().valid : current().ready)) return;
      event.preventDefault();
      if (event.repeat) return;
      if (key === 'b') {
        if (!valve.disabled) { toy.submarineValve(); sync(); }
      } else start('key:' + key, keyDirections[key]);
    }, true);
    window.addEventListener('keyup', function (event) {
      var key = event.key.toLowerCase();
      if (!sources.has('key:' + key)) return;
      event.preventDefault();
      stop('key:' + key);
    }, true);
    window.addEventListener('blur', release);
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', function () { if (document.hidden) release(); });

    function sync() {
      var reading = current();
      var visible = reading.state.scene === 'slime-submarine';
      if (reading.run !== model || !reading.ready) release();
      model = reading.run;
      if (visible !== live) {
        live = visible;
        box.hidden = !visible;
        shell.classList.toggle('has-submarine-controls', visible);
        if (toy.resize) toy.resize();
      }
      if (!visible) return;
      var sample = reading.sample;
      var ready = !!(sample && sample.ready && !sample.error);
      directions.forEach(function (name) { buttons[name].disabled = !reading.ready; });
      valve.disabled = !reading.valid || !!(sample && sample.blocked);
      restart.disabled = !reading.valid;
      text(el('state'), reading.state.loading || !ready ? 'Starting' : reading.state.paused ? 'Paused' : '');
      var depth = ready && Number.isFinite(sample.depth) ? Math.round(Math.max(0, Math.min(1, sample.depth)) * 100) : 0;
      var fill = ready && Number.isFinite(sample.fill) ? Math.round(Math.max(0, Math.min(1, sample.fill)) * 100) : 0;
      text(el('depth'), ready ? depth + '%' : '...');
      text(el('fill'), ready ? fill + '%' : '...');
      el('fill-bar').style.width = fill + '%';
      el('depth').setAttribute('aria-label', 'Depth, ' + depth + ' percent of the pool');
      el('fill').setAttribute('aria-label', 'Ballast tank ' + fill + ' percent full');
      valve.setAttribute('aria-pressed', String(!!(ready && sample.open)));
      text(el('valve-label'), sample && sample.blocked ? 'Ballast blocked' : ready && sample.open ? 'Close ballast' : 'Open ballast');
      text(el('ballast-help'), sample && sample.blocked ? 'The ballast valve is blocked.' : ready && sample.open ? 'Dive to fill. Rise clear of the water to drain.' : 'Ballast stays trapped while closed.');
      var visited = ready ? sample.visited || 0 : 0;
      var total = ready ? sample.totalTargets || 3 : 3;
      text(el('course'), sample && sample.completed ? 'Course complete' : visited + ' / ' + total + ' rings');
      box.classList.toggle('is-complete', !!(sample && sample.completed));
    }
    sync();
    return { sync: sync, release: release };
  }
  root.WSSSubmarineControls = { create: create };
})(window);
