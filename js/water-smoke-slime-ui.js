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
    var panelTrigger = null;
    var presetsButton = document.getElementById('toy-presets-open');
    var selectedMaterial = 'water';
    var lastTool = null;
    var picker = document.getElementById('toy-scene-picker');
    var pickerSummary = picker.querySelector('summary');
    var sceneLabel = document.getElementById('toy-scene-label');
    var lastScene = null;
    var buildKind = 'pipe';
    var notice = '';
    var rejectedLinkError = new URLSearchParams(location.search).has('build') && toy.buildState ? toy.buildState().error : null;
    var dismissedLinkError = null;
    var pressureColors = false;
    var glassWalls = true;
    var slowMotion = false;
    var valveSignature = null;
    var phoneLayout = window.matchMedia('(max-width: 520px)');
    var playback = shell.querySelector('.toy-playback');
    function placePlayback() {
      shell.querySelector(phoneLayout.matches ? '.toy-foot' : '.toy-top').appendChild(playback);
      toy.resize();
    }
    // Leave the entire scene visible on phones, including the upper inlets.
    phoneLayout.addEventListener('change', placePlayback);
    placePlayback();
    var sceneHints = {
      falls: 'Drop a slime into the falling water.',
      zerog: 'Pull a slime through the floating water.',
      chimney: 'Move a slime into a plume and watch it split.',
      spa: 'Drop the top slime into the pool.',
      rig: 'Try an exhaust at idle, on the move, or under boost.',
      blank: 'Choose a material to add, or draw your own container.',
      siphon: 'Open the valve, then watch the two water levels.',
      cup: 'Drop the slime in, then watch the fill line.',
      heron: 'Add water to the basin, then watch the sealed chambers.'
    };
    var hints = {
      poke: 'Grab near a slime’s edge to stretch it. Drag empty space to stir.',
      water: 'Hold to pour. Drag to make a splash.',
      smoke: 'Hold and drag to send smoke swirling.',
      slime: 'Tap to drop a slime. Drag to place it.',
      draw: 'Drag to draw a wall. Everything feels it.',
      erase: 'Drag across a wall to let everything through.',
      build: 'Choose a part in Build, then drag to place it.'
    };
    var buildHints = {
      pipe: 'Drag a pipe. Change direction to add a bend.',
      'open-vessel': 'Drag a cup with an open top.',
      'sealed-vessel': 'Drag a closed jar. Use Vent to cut an opening.',
      vent: 'Drag across a wall to cut an opening.',
      seal: 'Drag across an opening to add a wall.',
      check: 'Drag across a pipe for a check valve. Direction sets which way it can open.',
      flap: 'Drag across a pipe for a flap valve. Use Grab to tap it open or closed.',
      nozzle: 'Drag across an outlet to narrow it. Pipe bore sets the nozzle opening.'
    };
    var sceneNames = { falls: 'Cascade', zerog: 'Drift', chimney: 'Plumes', rig: 'Rig exhaust', spa: 'Spring', blank: 'Empty', siphon: 'Siphon', cup: 'Greedy cup', heron: "Heron's fountain" };

    function text(id, value) {
      var element = document.getElementById(id);
      if (element.textContent !== value) element.textContent = value;
    }
    function pressed(button, active) {
      button.setAttribute('aria-pressed', String(active));
      if (button.classList.contains('is-on') !== active) button.classList.toggle('is-on', active);
    }
    function controlsHeight() {
      var height = Math.ceil(shell.querySelector('.toy-dock').getBoundingClientRect().height + shell.querySelector('.toy-foot').getBoundingClientRect().height);
      var value = height + 'px';
      if (shell.style.getPropertyValue('--toy-controls-height') !== value) shell.style.setProperty('--toy-controls-height', value);
    }
    function fitPanel() {
      if (!openPanel) return;
      openPanel.style.maxHeight = ''; openPanel.style.bottom = '';
      if (openPanel.id === 'toy-panel-smoke' && innerWidth >= 1050 && shell.classList.contains('smoke-library-open')) return;
      var bounds = openPanel.getBoundingClientRect();
      if (bounds.bottom > innerHeight - 8) {
        openPanel.style.bottom = (parseFloat(getComputedStyle(openPanel).bottom) + bounds.bottom - innerHeight + 8) + 'px';
        bounds = openPanel.getBoundingClientRect();
      }
      var ceiling = Math.max(8, shell.getBoundingClientRect().top + shell.querySelector('.toy-top').getBoundingClientRect().height + 8);
      if (bounds.bottom - ceiling < 96) ceiling = 8;
      openPanel.style.maxHeight = Math.max(96, Math.min(620, bounds.bottom - ceiling)) + 'px';
    }

    // Relocate the original buttons, preserving all preset handlers and values.
    var generated = bar.querySelector('.toy-presets');
    if (generated) {
      Array.from(generated.children).forEach(function (row) {
        var key = row.querySelector('[data-preset]').dataset.preset.split(':')[0];
        var material = key.replace(/Look|Scale/, '');
        row.querySelector('label').textContent = /Look$/.test(key) ? 'Appearance' : /Scale$/.test(key) ? 'Size & energy' : material === 'slime' ? 'Material' : 'Behavior';
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
      if (panelTrigger) panelTrigger.setAttribute('aria-expanded', 'false');
      if (returnFocus) opener.focus({ preventScroll: true });
      openPanel = opener = panelTrigger = null;
    }

    function showPanel(button, focusOwner) {
      // Consume a pending scene change before opening the requested panel.
      // Otherwise the next sync closes a panel opened just after that change.
      sync();
      var panel = document.getElementById('toy-panel-' + button.dataset.panel);
      var wasOpen = panel === openPanel;
      closePanel(false);
      if (wasOpen) return;
      picker.open = false;
      openPanel = panel;
      panelTrigger = button;
      opener = focusOwner || button;
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      opener.setAttribute('aria-expanded', 'true');
      var focus = panel.querySelector('[data-preset].is-on') || panel.querySelector('input:not([readonly])') || panel.querySelector('select') || panel.querySelector('button');
      if (focus) focus.focus({ preventScroll: true });
      controlsHeight();
      fitPanel();
    }

    bar.querySelectorAll('[data-panel]').forEach(function (button) {
      button.addEventListener('click', function () {
        var material = /^(water|smoke|slime)$/.test(button.dataset.panel);
        if (material) selectedMaterial = button.dataset.panel;
        showPanel(button, material ? presetsButton : button);
        if(button.id==='toy-machine-view'){
          document.querySelector('.toy-build-camera').scrollIntoView({block:'nearest',behavior:'instant'});
          document.querySelector('[data-camera="zoom-in"]').focus({preventScroll:true});
        }
        sync();syncCamera();
      });
    });
    presetsButton.addEventListener('click', function () {
      showPanel(bar.querySelector('[data-panel="' + selectedMaterial + '"]'), presetsButton);
    });
    bar.querySelectorAll('[data-close]').forEach(function (button) {
      button.addEventListener('click', function () { closePanel(true); });
    });
    document.addEventListener('pointerdown', function (event) {
      if (openPanel && !openPanel.contains(event.target) && !event.target.closest('[data-panel], #toy-presets-open')) closePanel(false);
      if (picker.open && !picker.contains(event.target)) picker.open = false;
    });
    document.addEventListener('focusin', function (event) {
      if (openPanel && !openPanel.contains(event.target) && !event.target.closest('[data-panel], #toy-presets-open')) closePanel(false);
    });

    function buildOptions() {
      return { bore: +document.getElementById('toy-build-bore').value, direction: document.getElementById('toy-build-direction').value,
        material: document.getElementById('toy-build-material').value, open: document.getElementById('toy-build-open').value === 'true' };
    }
    function buildSelect(kind) {
      try { toy.buildTool(kind, buildOptions()); buildKind = kind; notice = ''; }
      catch (error) { notice = error.message; }
      sync();
    }
    bar.querySelectorAll('[data-build-tool]').forEach(function (button) {
      button.addEventListener('click', function () {
        buildSelect(button.dataset.buildTool);closePanel(false);
        document.getElementById('toy-input').focus({preventScroll:true});
      });
    });
    document.getElementById('toy-panel-build').querySelectorAll('.toy-build-options select').forEach(function (select) {
      select.addEventListener('change', function () {
        if (select.id === 'toy-build-material') {
          glassWalls = select.value === 'glass'; toy.glass(glassWalls);
          pressed(document.getElementById('toy-glass-toggle'), glassWalls);
        }
        buildSelect(buildKind);
      });
    });
    ['undo', 'redo'].forEach(function (name) {
      document.getElementById('toy-build-' + name).addEventListener('click', function () {
        try { notice = toy[name]() ? '' : 'There is nothing to ' + name + '.'; }
        catch (error) { notice = error.message; }
        sync();
      });
    });
    function syncCamera(){
      if(!toy.camera)return;
      var view=toy.camera();
      document.getElementById('toy-camera-status').textContent=view.zoom===1 ? 'Fitted view' : view.zoom+'x fitted view';
      var disabled={'zoom-in':view.zoom>=4,'zoom-out':view.zoom<=1,
        left:view.panX>=view.maxPanX-.5,right:view.panX<=-view.maxPanX+.5,
        up:view.panY>=view.maxPanY-.5,down:view.panY<=-view.maxPanY+.5};
      bar.querySelectorAll('[data-camera]').forEach(function(button){button.disabled=!!disabled[button.dataset.camera];});
    }
    bar.querySelectorAll('[data-camera]').forEach(function(button){
      button.addEventListener('click',function(){
        if(!toy.camera || !toy.setCamera)return;
        var view=toy.camera(),change={},action=button.dataset.camera;
        if(action==='zoom-in')change.zoom=view.zoom*2;
        if(action==='zoom-out')change.zoom=view.zoom*.5;
        if(action==='reset')change={zoom:1,panX:0,panY:0};
        if(action==='left')change.panX=view.panX+Math.max(44,view.width*.25);
        if(action==='right')change.panX=view.panX-Math.max(44,view.width*.25);
        if(action==='up')change.panY=view.panY+Math.max(44,view.height*.25);
        if(action==='down')change.panY=view.panY-Math.max(44,view.height*.25);
        try{toy.setCamera(change);notice='';}catch(error){notice=error.message;}
        syncCamera();
      });
    });
    window.addEventListener('resize',syncCamera);
    window.addEventListener('scroll',syncCamera,{passive:true});
    document.getElementById('toy-build-share').addEventListener('click', async function () {
      var shared=false;
      try {
        var link = await toy.shareBuild();
        document.getElementById('toy-share-wrap').hidden = false;
        var field = document.getElementById('toy-share-url'); field.value = link;shared=true;
        notice = 'Build link includes walls and parts. It opens with an empty box.';
        try { await navigator.clipboard.writeText(link); notice = 'Build link copied. It includes walls and parts and opens with an empty box.'; }
        catch (error) { field.focus({ preventScroll: true }); field.select(); }
      } catch (error) { notice = error.message; }
      sync();
      if(shared)document.getElementById('toy-share-wrap').scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    });
    document.getElementById('toy-machine-primary').addEventListener('click', function () {
      try { toy.machinePrimary(); }
      catch (error) { notice = error.message; }
      updateMeasurements();
    });
    document.getElementById('toy-siphon-setup').addEventListener('change', async function () {
      var setup=this.value;
      this.disabled=true;
      try { await toy.machine('siphon',{setup:setup}); }
      catch(error){notice=error.message;}
      finally{this.disabled=false;updateMeasurements();}
    });
    document.getElementById('toy-pressure-toggle').addEventListener('click', function () {
      pressureColors = !pressureColors; toy.pressureView(pressureColors); pressed(this, pressureColors); updateMeasurements();
    });
    document.getElementById('toy-slow-toggle').addEventListener('click', function () {
      slowMotion = !slowMotion; toy.set('time', slowMotion ? .25 : 1); pressed(this, slowMotion);
    });
    document.getElementById('toy-time').addEventListener('input', function () {
      slowMotion = +this.value === 25; pressed(document.getElementById('toy-slow-toggle'), slowMotion);
    });
    document.getElementById('toy-glass-toggle').addEventListener('click', function () {
      glassWalls = !glassWalls; toy.glass(glassWalls); pressed(this, glassWalls);
      document.getElementById('toy-build-material').value = glassWalls ? 'glass' : 'opaque';
    });

    function number(value, unit, precision) {
      if (!Number.isFinite(value)) return 'Waiting';
      if (value !== 0 && Math.abs(value) < .001) return value.toExponential(2) + ' ' + unit;
      return Number(value.toPrecision(precision || 3)).toLocaleString('en-US', { maximumFractionDigits: 5 }) + ' ' + unit;
    }
    function manualValves() {
      if (!openPanel || openPanel.id !== 'toy-panel-build') return;
      var builder = toy.builder ? toy.builder() : null;
      var parts = builder ? builder.getParts().filter(function (part) { return part.type === 'flap'; }) : [];
      var signature = parts.map(function (part) { return part.id + ':' + part.open; }).join('|');
      if (signature === valveSignature) return;
      valveSignature = signature;
      var list = document.getElementById('toy-build-valve-list');
      var focused = list.contains(document.activeElement) ? document.activeElement.dataset.valveId : null;
      list.replaceChildren(); document.getElementById('toy-build-valves').hidden = !parts.length;
      parts.forEach(function (part) {
        var button = document.createElement('button'); button.className = 'toy-chip'; button.dataset.valveId = part.id;
        button.textContent = 'Valve ' + part.id + ': ' + (part.open ? 'Open' : 'Closed');
        button.title = (part.open ? 'Close' : 'Open') + ' valve ' + part.id;
        pressed(button, part.open);
        button.addEventListener('click', function () {
          try { toy.valve(part.id, !part.open); notice = ''; }
          catch (error) { notice = error.message; }
          updateMeasurements();
        });
        button.addEventListener('focus',function(){if(toy.highlightValve)toy.highlightValve(part.id);});
        button.addEventListener('blur',function(){if(toy.highlightValve)toy.highlightValve(null);});
        list.appendChild(button);
        if (String(part.id) === focused) button.focus({ preventScroll: true });
      });
      fitPanel();
    }
    function updateMeasurements() {
      var state = toy.stats(), machine = /^(siphon|cup|heron)$/.test(state.scene);
      text('toy-fps', state.fps + ' FPS');
      var sample = toy.instruments ? toy.instruments() : { ready: false };
      var liveMachine = toy.machineState ? toy.machineState() : null;
      var air = toy.airStats ? toy.airStats() : { enabled: false };
      var contextual = machine || air.enabled;
      var ledger=sample.ledger || {},convergence=sample.convergence;
      var fatal=sample.error || air.error || (toy.liquid && toy.liquid() && toy.liquid().materialStateError);
      var stale = Number.isFinite(sample.sampleAgeMs) && sample.sampleAgeMs > 250;
      var unresolvedGeometry=convergence && convergence.constitutiveGeometryResolved===false;
      var diagnostic=convergence && (!convergence.phaseResolved || !convergence.cavitationResolved ||
        unresolvedGeometry || ledger.overflowErrors || ledger.connectivityErrors || ledger.nonpositiveVolumes ||
        !Number.isFinite(convergence.waterPressureError) || !Number.isFinite(convergence.gasPressureError) ||
        Math.max(convergence.waterPressureError,convergence.gasPressureError)>.1);
      var pressureLabel=fatal ? 'Pressure stopped' : !sample.ready || !convergence ? 'Waiting for pressure' : diagnostic ? 'Diagnostic' : stale ? 'Stale sample' : null;
      var pressureMessage=fatal ? 'The pressure calculation stopped. Restart or choose another scene.' : !sample.ready || !convergence ? 'Waiting for a pressure sample.' :
        diagnostic ? 'Pressure readings are diagnostic. Open Instruments for the calculation status.' : stale ? 'The pressure sample is old. Open Instruments for its age.' :
        'The pressure sample is current. Machine behavior is still under test.';
      document.getElementById('toy-machine-diagnostics').hidden=!contextual;
      text('toy-machine-diagnostics',contextual ? pressureMessage : '');
      if(contextual)text('toy-status',pressureLabel || (state.paused ? 'Paused' : 'Live'));
      document.getElementById('toy-machine-material-notice').hidden = !air.enabled;
      document.getElementById('toy-machine-summary').hidden = !machine;
      document.getElementById('toy-machine-metrics').hidden = !machine;
      var siphon=state.scene==='siphon';
      document.getElementById('toy-siphon-options').hidden=!siphon;
      document.getElementById('toy-siphon-setup-note').hidden=!siphon;
      var setupSelect=document.getElementById('toy-siphon-setup');
      if(siphon && liveMachine && liveMachine.ready && !setupSelect.disabled)setupSelect.value=liveMachine.definition.setup;
      document.getElementById('toy-instruments-open').hidden = !contextual;
      if (!contextual && openPanel && openPanel.id === 'toy-panel-instruments') closePanel(false);
      if (machine) {
        text('toy-machine-caption', sample.caption || (liveMachine && liveMachine.definition.caption) || 'The apparatus is being assembled. Measurements will appear when it is ready.');
        text('toy-machine-primary', (liveMachine && liveMachine.definition.action) || sample.action || 'Starting');
        var ready = liveMachine ? liveMachine.ready : sample.ready;
        document.getElementById('toy-machine-primary').disabled = !ready || !!fatal || (state.scene === 'cup' && liveMachine && liveMachine.primaryUsed);
      }
      text('toy-compact-head', number(sample.headInches, 'in'));
      text('toy-compact-flow', number(sample.flowCubicInchesPerSecond, 'in³/s'));
      document.getElementById('toy-machine-metrics').classList.toggle('is-stale', stale);
      document.getElementById('toy-machine-metrics').title = stale ? 'The measurement sample is more than a quarter second old.' : '';
      text('toy-machine-scale', sample.scaleText || 'The box is 30 inches wide and 1 inch deep. Seconds use Earth gravity.');
      [['pressure', 'pressurePsi', 'psi'], ['speed', 'speedInchesPerSecond', 'in/s'], ['ideal-speed', 'idealSpeedInchesPerSecond', 'in/s'],
        ['flow', 'flowCubicInchesPerSecond', 'in³/s'], ['clock', 'clockSeconds', 's'], ['jet', 'jetRiseInches', 'in'], ['ideal-jet', 'idealJetRiseInches', 'in'],
        ['air-work', 'airWorkFootPounds', 'ft·lbf'], ['water-work', 'gravityWorkFootPounds', 'ft·lbf'], ['age', 'sampleAgeMs', 'ms'],
        ['kinetic', 'kineticWorkFootPounds', 'ft·lbf'], ['acoustic', 'acousticWorkFootPounds', 'ft·lbf'], ['initial-work', 'initialWaterWorkFootPounds', 'ft·lbf'],
        ['input-work', 'inputWaterWorkFootPounds', 'ft·lbf'], ['released-work', 'releasedGravityWorkFootPounds', 'ft·lbf'], ['energy-residual', 'energyResidualFootPounds', 'ft·lbf'],
        ['room-pressure', 'roomAbsolutePressurePsi', 'psi'], ['minimum-pressure', 'minimumGaugePressurePsi', 'psi'], ['sound-speed', 'soundSpeedInchesPerSecond', 'in/s']].forEach(function (field) {
        var value = number(sample[field[1]], field[2]);
        if (field[0] === 'age' && stale) value += ' (stale)';
        text('toy-i-' + field[0], value);
      });
      text('toy-numerical-status', fatal ? 'The pressure calculation stopped. These readings are diagnostic.' :
        unresolvedGeometry ? 'The water geometry is unresolved. These readings are diagnostic.' :
        sample.numericalStatus || 'Waiting for a pressure sample.');
      text('toy-energy-status', sample.energyBudgetStatus || 'Energy measurements will appear with the next apparatus sample.');
      slowMotion = +document.getElementById('toy-time').value === 25;
      pressed(document.getElementById('toy-slow-toggle'), slowMotion);
      var legend = document.getElementById('toy-pressure-legend');
      legend.hidden = !pressureColors || !contextual;
      if (!legend.hidden) {
        var cap = window.WaterMachinesInstruments && toy.world ? window.WaterMachinesInstruments.scale({ width: toy.world().w }).psi(80000) : null;
        text('toy-pressure-legend', 'Pressure: rose below room air (0 psi); gold above. Full color at ' + (Number.isFinite(cap) ? '±' + number(cap, 'psi') : 'the model limit') + '.');
      }
      var builderState = toy.buildState ? toy.buildState() : {};
      var message = builderState.error || sample.error || notice;
      if(dismissedLinkError && message===dismissedLinkError)message=notice;
      // Preserve exact API diagnostics for tests while explaining a bad link
      // in the disclosure with ordinary words.
      if(/^Build: build is too detailed for a URL$/.test(message || ''))
        message='This build has too much detail for a link. Remove some parts or simplify the walls, then share again.';
      else if(rejectedLinkError && message===rejectedLinkError && !dismissedLinkError)
        message="This build link couldn't be read. Choose a scene to keep playing.";
      else if(/^Build: pipe (bore or walls|walls) outside editable grid$/.test(message || ''))
        message='Leave room for the pipe walls. Move the pipe away from the box edge, or choose a narrower bore.';
      else if(/^Build:.*(share|encoding|wall runs|initial wall bit|permanent border)/.test(message || ''))
        message="This build link couldn't be read. Your current build is still here.";
      document.getElementById('toy-build-notice').hidden = !message;
      text('toy-build-notice', message || '');
      manualValves();
      controlsHeight();
    }

    function sync() {
      syncCamera();
      var state = toy.stats();
      var building = /^(build|draw|erase)$/.test(state.tool);
      shell.dataset.activeTool = state.tool;
      shell.classList.toggle('is-paused', state.paused);
      pauseButton.setAttribute('aria-pressed', String(state.paused));
      pauseButton.setAttribute('aria-label', state.paused ? 'Resume' : 'Pause');
      pauseButton.title = (state.paused ? 'Resume' : 'Pause') + ' (Space)';
      pauseButton.querySelector('path').setAttribute('d', state.paused ? 'm8 5 11 7-11 7Z' : 'M8 5v14M16 5v14');
      resumeButton.hidden = !state.paused;
      var resumeParent=building ? playback : document.getElementById('toy-viewport');
      if(resumeButton.parentElement!==resumeParent)resumeParent.appendChild(resumeButton);
      var label = state.paused ? 'Paused' : state.waterState === 'booting' ? 'Starting water' : 'Live';
      if (status.textContent !== label) status.textContent = label;
      var instruction = state.tool === 'poke' ? (sceneHints[state.scene] || hints.poke) : hints[state.tool] || hints.poke;
      if(state.tool==='build')instruction=buildHints[toy.buildState().kind] || hints.build;
      if(state.paused && state.tool==='poke' && toy.builder && toy.builder() &&
        toy.builder().getParts().some(function(part){return part.type==='flap';}))
        instruction='Open Build and use Placed valves to change a valve while paused.';
      if (state.tool === 'poke' &&
          ((/^(falls|zerog|spa)$/.test(state.scene) && state.waterState === 'off') ||
           (/^(chimney|rig)$/.test(state.scene) && !state.smoke))) instruction = hints.poke;
      if (hint.textContent !== instruction) hint.textContent = instruction;
      if (state.tool !== lastTool && /^(water|smoke|slime)$/.test(state.tool)) selectedMaterial = state.tool;
      lastTool = state.tool;
      if (state.scene !== lastScene) {
        if (lastScene !== null) closePanel(false);
        lastScene = state.scene;
        notice = ''; document.getElementById('toy-share-wrap').hidden = true;
      }
      text('toy-scene-label', (sceneNames[state.scene] || state.scene) + (state.scene==='heron' ? ' (in progress)' : ''));
      bar.querySelectorAll('[data-tool], [data-scene], [data-preset]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.classList.contains('is-on')));
      });
      pressed(bar.querySelector('.toy-tools [data-tool="build"]'), building);
      var builderState = toy.buildState ? toy.buildState() : null;
      if (builderState) buildKind = state.tool === 'draw' || state.tool === 'erase' ? state.tool : builderState.kind;
      bar.querySelectorAll('[data-build-tool]').forEach(function (button) { pressed(button, button.dataset.buildTool === buildKind); });
      bar.querySelectorAll('[data-panel="water"], [data-tool="water"]').forEach(function (button) {
        button.disabled = state.waterState === 'off';
      });
      bar.querySelectorAll('[data-panel="smoke"], [data-tool="smoke"]').forEach(function (button) {
        button.disabled = !state.smoke;
      });
      ['water', 'smoke', 'slime'].forEach(function (material) {
        var selected = Array.from(bar.querySelectorAll('[data-presets="' + material + '"] .is-on'));
        var names = selected.map(function (button) { return button.textContent; }).join(' / ');
        bar.querySelector('[data-panel="' + material + '"]').title = material + ' presets: ' + names;
      });
      presetsButton.querySelector('span').textContent = selectedMaterial.charAt(0).toUpperCase() + selectedMaterial.slice(1) + ' presets';
      presetsButton.setAttribute('aria-controls', 'toy-panel-' + selectedMaterial);
      presetsButton.title = bar.querySelector('[data-panel="' + selectedMaterial + '"]').title;
      presetsButton.disabled = selectedMaterial === 'water' ? state.waterState === 'off' : selectedMaterial === 'smoke' ? !state.smoke : false;
      updateMeasurements();
    }

    function pause(value) {
      toy.pause(value);
      sync();
    }
    pauseButton.addEventListener('click', function () { pause(!toy.stats().paused); });
    resumeButton.addEventListener('click', function () { pause(false); document.getElementById('toy-input').focus({ preventScroll: true }); });
    document.getElementById('toy-restart').addEventListener('click', async function () {
      this.disabled=true;
      try {
        if(toy.stats().scene==='siphon')await toy.machine('siphon',{setup:document.getElementById('toy-siphon-setup').value});
        else await toy.scene(toy.stats().scene);
        pause(false);
      } catch(error){notice=error.message;}
      finally{this.disabled=false;sync();}
    });
    document.querySelectorAll('[data-try]').forEach(function (button) {
      button.addEventListener('click', function () {
        var kind = button.dataset.try;
        toy.scene(kind === 'smoke' ? 'chimney' : 'falls');
        toy.tool(kind === 'water' ? 'erase' : 'poke');
        pause(false);
        shell.scrollIntoView({ block: 'start', behavior: 'instant' });
        document.getElementById('toy-input').focus({ preventScroll: true });
      });
    });
    bar.addEventListener('click', function (event) {
      if (event.target.closest('[data-scene], #toy-clear')) {
        picker.open = false; closePanel(false);
        var sceneButton=event.target.closest('[data-scene]');
        // Machine construction preserves its original pause state, including
        // a rejected request that leaves the current scene untouched.
        if(!sceneButton || !/^(siphon|cup|heron)$/.test(sceneButton.dataset.scene))pause(false);
        if(rejectedLinkError && ((sceneButton && toy.stats().scene===sceneButton.dataset.scene) ||
          (!sceneButton && toy.stats().scene==='blank'))){
          dismissedLinkError=rejectedLinkError;updateMeasurements();
        }
        // The host records a rejected asynchronous scene request after this
        // click finishes. Read that result without changing playback.
        if(sceneButton)setTimeout(sync,0);
        if(sceneButton)pickerSummary.focus({ preventScroll: true });
      }
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
      if(event.defaultPrevented)return;
      if (event.key === 'Escape') {
        if (openPanel) { event.preventDefault(); closePanel(true); }
        else if (picker.open) { event.preventDefault(); picker.open = false; pickerSummary.focus({ preventScroll: true }); }
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
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { controlsHeight(); toy.resize(); fitPanel(); }).observe(shell);
    window.addEventListener('resize', fitPanel);
    window.addEventListener('scroll', fitPanel, { passive: true });
    // Reading the existing sample never requests another GPU snapshot.
    window.setInterval(function () { if (!document.hidden) updateMeasurements(); }, 200);
    sync();
    toy.resize();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
