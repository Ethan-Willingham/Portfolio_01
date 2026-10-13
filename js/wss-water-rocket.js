/* Bottle-rocket experiment. The scene uses its own reduced flight model. */
(function (root) {
  'use strict';
  function make(world, options) {
    options = options || {};
    return {
      name: 'water-rocket', title: 'Water rocket', draft: true, waterRocketModel: true,
      setup: 'launch', setups: [], action: 'Pressurize', primary: {kind: 'rocket-console'},
      readingLabel: 'Bottle rocket', quietApparatus: true,
      rocketOptions: {fillFraction: options.fillFraction || .35, targetPressurePsi: options.targetPressurePsi || 60},
      vessels: [], pipes: [], solids: [], vents: [], parts: [], slimes: [], initial: [], marks: [], meters: [],
      settings: {enabled: false}, boundaries: null,
      viewBounds: {x: 0, y: 0, width: 720, height: 400},
      caption: 'Choose the water fill and air pressure, pressurize the bottle, then release it. Compare the height of successive flights.',
      source: {title: 'NASA: flight of a water rocket', url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/flight-of-a-water-rocket/'},
      boundaryNote: 'This scene replaces the earlier guided tank with a reduced, vertical bottle-rocket model. A 2-liter bottle carries a finite water charge and ideal gas. A compressor adds air while the launch latch holds it. After release, adiabatic expansion drives water through a nozzle; expelled momentum produces thrust. Compressible air blowdown follows. Gravity and quadratic drag determine the flight. The water spray represents the expelled batches, traveling ballistically. The bottle is enlarged in flight so its contents remain legible.',
      energyBudgetStatus: 'The compressor supplies external work. This model assumes uniform dry air, a rigid bottle, vertical flight, fixed discharge and drag coefficients, and no wind or tumbling. Water parcels in the spray have no mutual collisions, and landing ends the flight without a bounce. It is an illustrative simulation, not a prediction for a real bottle or launch setup. The shared native water solver is not used by this scene.'
    };
  }
  var previous = root.WSSDraftRuntime;
  root.WSSDraftRuntime = {create: function (context) {
    if (!context.definition.waterRocketModel) return previous && previous.create ? previous.create(context) : null;
    var definition = context.definition, model = root.WSSWaterRocketModel.create(definition.rocketOptions);
    var shell = document.getElementById('toy'), viewport = document.getElementById('toy-viewport');
    var panel = document.createElement('section');
    panel.id = 'toy-water-rocket'; panel.className = 'rocket-experiment'; panel.setAttribute('aria-label', 'Water rocket launch experiment');
    panel.innerHTML = '<aside class="rocket-console">' +
      '<header class="rocket-heading"><p class="rocket-eyebrow">Pressure / propulsion</p><h2>Water <br>rocket.</h2><p class="rocket-intro">A bottle, some water,<br>and a pocket of compressed air.</p></header>' +
      '<div class="rocket-setup"><label for="rocket-fill"><span>Water fill</span><output id="rocket-fill-value">35%</output></label><input id="rocket-fill" type="range" min="15" max="75" step="5" value="35"><div class="rocket-range-ends"><span>More air</span><span>More water</span></div>' +
      '<label for="rocket-pressure"><span>Launch pressure</span><output id="rocket-target-value">60 psi</output></label><input id="rocket-pressure" type="range" min="20" max="90" step="5" value="60"><div class="rocket-range-ends"><span id="rocket-pressure-min">20 psi</span><span id="rocket-pressure-max">90 psi</span></div></div>' +
      '<div class="rocket-launch"><button id="rocket-primary" type="button">Pressurize</button><div class="rocket-charge-track" aria-hidden="true"><i id="rocket-charge-fill"></i></div><p id="rocket-guidance" role="status" aria-live="polite">Choose your fill, then charge the bottle.</p></div>' +
      '<div class="rocket-options"><label for="rocket-slow"><input id="rocket-slow" type="checkbox">Slow motion</label><button id="rocket-units" type="button" aria-pressed="false">Metric</button></div>' +
      '<div class="rocket-record"><span id="rocket-record-label">The experiment</span><strong id="rocket-record-value">How high will it go?</strong><p id="rocket-record-note">Try less water on your next flight. It changes both the propellant and the weight.</p></div></aside>' +
      '<div class="rocket-scene"><div class="rocket-telemetry" aria-label="Flight measurements">' +
      '<div><span>Altitude</span><p><output id="rocket-altitude">0.0</output><small id="rocket-altitude-unit">ft</small></p></div>' +
      '<div><span>Speed</span><p><output id="rocket-speed">0.0</output><small id="rocket-speed-unit">mph</small></p></div>' +
      '<div><span>Tank pressure</span><p><output id="rocket-pressure-value">0</output><small id="rocket-pressure-unit">psi</small></p></div>' +
      '<div class="rocket-peak"><span>Peak height</span><p><output id="rocket-peak">0.0</output><small id="rocket-peak-unit">ft</small></p></div></div>' +
      '<div class="rocket-drawing"><canvas id="rocket-canvas" aria-hidden="true"></canvas><div class="rocket-flight-tag"><span id="rocket-stage-label">On the launch pad</span><span id="rocket-flight-time">T + 0.00 s</span></div></div>' +
      '<footer class="rocket-flight-strip"><ol aria-label="Flight stages"><li data-flight-stage="prepare">01 <span>Prepare</span></li><li data-flight-stage="charge">02 <span>Pressurize</span></li><li data-flight-stage="launch">03 <span>Launch</span></li><li data-flight-stage="flight">04 <span>Flight</span></li></ol><span class="rocket-model-note">Calculated flight / 2 L bottle</span></footer></div>';
    viewport.appendChild(panel); shell.classList.add('has-water-rocket');
    var method = document.createElement('div'); method.className = 'rocket-method';
    method.innerHTML = '<h3>Water out, bottle up</h3><p>Compressed air drives water through the nozzle. The departing mass pushes the bottle upward. As the air expands, its pressure falls. Air escapes after the water is gone.</p>' +
      '<h3>Then gravity takes over</h3><p>When thrust ends, the bottle keeps climbing on its momentum. Gravity and air drag slow it, then it falls. Changing the fill changes both the available propellant and the weight.</p>' +
      '<dl><div><dt>Bottle capacity</dt><dd>2 liters</dd></div><div><dt>Empty mass</dt><dd id="rocket-model-mass">5.1 oz</dd></div><div><dt>Nozzle diameter</dt><dd id="rocket-model-nozzle">0.35 in</dd></div><div><dt>Water discharge coefficient</dt><dd>0.86</dd></div><div><dt>Drag coefficient</dt><dd>0.42</dd></div></dl>' +
      '<h3>What this model leaves out</h3><p>The bottle stays upright in still air. Its air has one pressure and temperature; there is no sloshing, tumbling or wind. The spray represents expelled water moving under gravity, with approximate breakup and no collisions between droplets. Landing ends the flight without a bounce.</p>' +
      '<p>The bottle is enlarged in flight so you can see it. The altitude scale follows its calculated position. This is an illustrative simulation, not a prediction for a real bottle or launcher.</p>' +
      '<p class="rocket-method-links"><a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/flight-of-a-water-rocket/" target="_blank" rel="noopener">NASA: water rocket flight</a><a href="https://people.ohio.edu/urieli/thermo/property_tables/gas/adiabatic/rocket/rocket.html" target="_blank" rel="noopener">The flight equations</a></p>';
    document.getElementById('toy-panel-instruments').appendChild(method);
    var canvas = panel.querySelector('canvas'), view = root.WSSWaterRocketView.create(canvas);
    var fill = panel.querySelector('#rocket-fill'), pressure = panel.querySelector('#rocket-pressure');
    var primary = panel.querySelector('#rocket-primary'), slow = panel.querySelector('#rocket-slow');
    fill.value = Math.round(definition.rocketOptions.fillFraction * 100); pressure.value = definition.rocketOptions.targetPressurePsi;
    var metric = false, best = 0, previousPeak = 0, flightCount = 0, recorded = false, retired = false, lastPhase = '';
    var label = {ready: 'On the launch pad', charging: 'Building pressure', armed: 'Ready for release', powered: 'Under thrust', coasting: 'Coasting upward', descending: 'Falling back', landed: 'Flight complete'};
    var guidance = {ready: 'Choose your fill, then charge the bottle.', charging: 'The latch holds the bottle as air goes in.', armed: 'The bottle is charged. Release the latch.', powered: 'Escaping mass pushes the bottle upward.', coasting: 'The thrust is gone. Momentum carries it upward.', descending: 'Past the highest point. Gravity brings it back.', landed: 'Change the fill and try another flight.'};
    function text(id, value) {var element = panel.querySelector('#' + id); if (element.textContent !== value) element.textContent = value;}
    function paused() {return !!(root.__toy && root.__toy.stats().paused);}
    function setOptions() {
      model.reset({fillFraction: +fill.value / 100, targetPressurePsi: +pressure.value});
      recorded = false; view.destroy(); view = root.WSSWaterRocketView.create(canvas); sync(); render();
    }
    function action() {
      if (paused()) return true;
      if (model.state.phase === 'ready') model.charge();
      else if (model.state.phase === 'armed') model.launch();
      else if (model.state.phase === 'landed') setOptions();
      sync(); render(); return true;
    }
    function sync() {
      var s = model.state, phase = s.phase, locked = phase !== 'ready', stopped = paused();
      definition.waterRocketReading = s;
      panel.dataset.phase = phase; panel.classList.toggle('is-paused', stopped);
      slow.checked = !!(root.__toy && root.__toy.stats().timeScale === .25);
      fill.disabled = pressure.disabled = locked;
      var button = phase === 'ready' ? 'Pressurize' : phase === 'charging' ? 'Pressurizing' : phase === 'armed' ? 'Launch rocket' : phase === 'landed' ? 'Prepare next flight' : 'Flight in progress';
      definition.action = button; text('rocket-primary', button);
      primary.disabled = stopped || (phase !== 'ready' && phase !== 'armed' && phase !== 'landed');
      text('rocket-fill-value', fill.value + '%');
      text('rocket-target-value', metric ? (+pressure.value * 6.894757).toFixed(0) + ' kPa' : pressure.value + ' psi');
      pressure.setAttribute('aria-valuetext', metric ? (+pressure.value * 6.894757).toFixed(0) + ' kilopascals' : pressure.value + ' pounds per square inch');
      fill.setAttribute('aria-valuetext', fill.value + ' percent water');
      text('rocket-pressure-min', metric ? '138 kPa' : '20 psi'); text('rocket-pressure-max', metric ? '621 kPa' : '90 psi');
      text('rocket-altitude', (s.altitude * (metric ? 1 : 3.28084)).toFixed(1));
      text('rocket-speed', (Math.abs(s.velocity) * (metric ? 1 : 2.236936)).toFixed(1));
      text('rocket-pressure-value', (s.pressurePa / (metric ? 1000 : 6894.757)).toFixed(0));
      text('rocket-peak', (s.peakAltitude * (metric ? 1 : 3.28084)).toFixed(1));
      ['altitude','peak'].forEach(function(id) {text('rocket-' + id + '-unit', metric ? 'm' : 'ft');});
      method.querySelector('#rocket-model-mass').textContent = metric ? '145 g' : '5.1 oz';
      method.querySelector('#rocket-model-nozzle').textContent = metric ? '9 mm' : '0.35 in';
      text('rocket-speed-unit', metric ? 'm/s' : 'mph'); text('rocket-pressure-unit', metric ? 'kPa' : 'psi');
      text('rocket-flight-time', 'T + ' + s.flightTime.toFixed(2) + ' s');
      text('rocket-stage-label', stopped ? 'Paused' : label[phase]);
      if (lastPhase !== phase || stopped) {text('rocket-guidance', stopped ? 'Paused. Resume from the toolbar to continue.' : guidance[phase]); lastPhase = stopped ? '' : phase;}
      panel.querySelector('#rocket-charge-fill').style.width = Math.min(100, s.pressurePa / (+pressure.value * 6894.757) * 100) + '%';
      var stage = phase === 'ready' ? 'prepare' : phase === 'charging' ? 'charge' : phase === 'armed' || phase === 'powered' ? 'launch' : 'flight';
      panel.querySelectorAll('[data-flight-stage]').forEach(function(item) {item.classList.toggle('is-active', item.dataset.flightStage === stage);});
      if (phase === 'landed' && !recorded) {previousPeak = s.peakAltitude; best = Math.max(best, previousPeak); flightCount++; recorded = true;}
      if (flightCount) {
        var distance = (previousPeak * (metric ? 1 : 3.28084)).toFixed(1) + (metric ? ' m' : ' ft');
        text('rocket-record-label', 'Flight ' + String(flightCount).padStart(2, '0'));
        text('rocket-record-value', distance + ' at the top');
        text('rocket-record-note', 'Best this session: ' + (best * (metric ? 1 : 3.28084)).toFixed(1) + (metric ? ' m.' : ' ft.') + ' Keep the pressure and change the fill to compare.');
      }
    }
    function render() {
      if (retired) return;
      sync();
      var bounds = canvas.parentElement.getBoundingClientRect();
      view.render(model.state, {width: bounds.width, height: bounds.height, unit: metric ? 'metric' : 'imperial', previousPeak: recorded ? 0 : previousPeak, best: best, paused: paused(), slow: slow.checked, fillFraction: +fill.value / 100});
    }
    fill.addEventListener('input', setOptions); pressure.addEventListener('input', setOptions); primary.addEventListener('click', action);
    panel.querySelector('#rocket-units').addEventListener('click', function (event) {metric = !metric; event.currentTarget.setAttribute('aria-pressed', String(metric)); render();});
    slow.addEventListener('change', function () {root.__toy.set('time', slow.checked ? .25 : 1); render();});
    var resize = new ResizeObserver(render); resize.observe(panel);
    var pauseObserver = new MutationObserver(render); pauseObserver.observe(shell, {attributes: true, attributeFilter: ['class']});
    var runtime = {
      smoke: false, primary: action, clock: function () {return model.state.elapsed;},
      tick: function (dt) {model.step(dt * (root.__toy ? root.__toy.stats().timeScale : 1)); sync();}, render: render,
      stats: function () {return model.snapshot();},
      destroy: function () {retired = true; resize.disconnect(); pauseObserver.disconnect(); view.destroy(); panel.remove(); method.remove(); shell.classList.remove('has-water-rocket'); if (root.WSSWaterRocket.active === runtime) root.WSSWaterRocket.active = null;}
    };
    root.WSSWaterRocket.active = runtime; render(); return runtime;
  }};
  root.WSSMachines = root.WSSMachines || {};
  root.WSSMachines['water-rocket'] = {make: make}; root.WSSWaterRocket = {make: make, active: null};
})(typeof window !== 'undefined' ? window : globalThis);
