/* Bottle-rocket experiment. The scene uses its own reduced flight model. */
(function (root) {
  'use strict';
  function make(world, options) {
    options = options || {};
    return {
      name: 'water-rocket', title: 'Water rocket', draft: true, waterRocketModel: true,
      setup: 'launch', setups: [], action: 'Hold to pump', primary: {kind: 'rocket-console'},
      readingLabel: 'Bottle rocket', quietApparatus: true,
      rocketOptions: {fillFraction: options.fillFraction || .35, targetPressurePsi: 90},
      vessels: [], pipes: [], solids: [
        {x:64,y:192,width:32,height:192},{x:224,y:192,width:32,height:192},
        {x:0,y:352,width:720,height:32}
      ], vents: [], parts: [], slimes: [], initial: [], marks: [], meters: [],
      settings: {enabled: false}, boundaries: null,
      viewBounds: {x: 0, y: 0, width: 720, height: 400},
      caption: 'Set the water level on the bottle, hold the pump to add air, then release the collar. Compare your flights.',
      source: {title: 'NASA: flight of a water rocket', url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/flight-of-a-water-rocket/'},
      boundaryNote: 'A 2-liter bottle carries a finite native water charge and reduced ideal-gas inventory. Holding the foot pump adds air. Releasing the collar adds no impulse. The pressure model computes water mass flow and thrust; each expelled mass quantum relocates one conserved native water parcel from the bottle into the nozzle jet. The shared WebGPU water solver then transports and lands those parcels. Gravity and drag determine bottle flight, followed by a damped ground-contact approximation.',
      energyBudgetStatus: 'The pump supplies external work. Water parcels are conserved in the shared native solver. The bottle-local reservoir is simulated in a fixed frame, then mapped into the moving bottle; inertial slosh is not resolved. The pressure and rigid-body models are reduced order. This is an illustrative simulation, not a prediction for a real bottle or launch setup.'
    };
  }
  var previous = root.WSSDraftRuntime;
  root.WSSDraftRuntime = {create: function (context) {
    if (!context.definition.waterRocketModel) return previous && previous.create ? previous.create(context) : null;
    var definition = context.definition, model = root.WSSWaterRocketModel.create(definition.rocketOptions);
    var water = context.rocketWater;
    if (!water || !context.liquid || !context.liquid.simActive) throw new Error('Water rocket requires the shared WebGPU water solver.');
    var shell = document.getElementById('toy'), viewport = document.getElementById('toy-viewport');
    var panel = document.createElement('section');
    panel.id = 'toy-water-rocket'; panel.className = 'rocket-experiment'; panel.setAttribute('aria-label', 'Water rocket launch experiment');
    panel.innerHTML = '<div class="rocket-scene"><div class="rocket-telemetry" aria-label="Flight measurements">' +
      '<div><span>Altitude</span><p><output id="rocket-altitude">0.0</output><small id="rocket-altitude-unit">ft</small></p></div>' +
      '<div><span>Speed</span><p><output id="rocket-speed">0.0</output><small id="rocket-speed-unit">mph</small></p></div>' +
      '<div><span>Tank pressure</span><p><output id="rocket-pressure-value">0</output><small id="rocket-pressure-unit">psi</small></p></div>' +
      '<div class="rocket-peak"><span>Peak height</span><p><output id="rocket-peak">0.0</output><small id="rocket-peak-unit">ft</small></p></div></div>' +
      '<div class="rocket-drawing"><canvas id="rocket-canvas" aria-hidden="true"></canvas>' +
      '<div class="rocket-flight-tag"><strong>Water rocket</strong><span id="rocket-stage-label">On the launch pad</span><span id="rocket-flight-time">T + 0.00 s</span></div>' +
      '<div class="rocket-apparatus-controls"><label class="rocket-fill-control" id="rocket-fill-control" for="rocket-fill"><span>Water in bottle <output id="rocket-fill-value">35%</output></span><input id="rocket-fill" type="range" min="15" max="75" step="5" value="35"></label>' +
      '<button id="rocket-pump" class="rocket-apparatus-button" type="button" aria-label="Hold to pump air into the bottle">Hold to pump</button>' +
      '<button id="rocket-latch" class="rocket-apparatus-button" type="button" aria-label="Release the rocket from its launch collar">Release collar</button>' +
      '<button id="rocket-next" class="rocket-apparatus-button" type="button">Set up again</button></div>' +
      '<p id="rocket-guidance" class="rocket-guidance" role="status" aria-live="polite">Set the water level, hold the pump, then release the collar.</p></div>' +
      '<footer class="rocket-flight-strip"><span id="rocket-record-label">The experiment</span><strong id="rocket-record-value">How high will it go?</strong><span id="rocket-record-note">Change the fill or pump longer on your next flight.</span>' +
      '<div class="rocket-options"><label for="rocket-slow"><input id="rocket-slow" type="checkbox">Slow motion</label><button id="rocket-units" type="button" aria-pressed="false">Metric</button></div></footer></div>';
    viewport.appendChild(panel); shell.classList.add('has-water-rocket');
    var method = document.createElement('div'); method.className = 'rocket-method';
    method.innerHTML = '<h3>Water out, bottle up</h3><p>Compressed air drives water through the nozzle. The departing mass pushes the bottle upward. As the air expands, its pressure falls. Air escapes after the water is gone.</p>' +
      '<h3>Then gravity takes over</h3><p>When thrust ends, the bottle keeps climbing on its momentum. Gravity and air drag slow it, then it falls. Changing the fill changes both the available propellant and the weight.</p>' +
      '<dl><div><dt>Bottle capacity</dt><dd>2 liters</dd></div><div><dt>Empty mass</dt><dd id="rocket-model-mass">5.1 oz</dd></div><div><dt>Nozzle diameter</dt><dd id="rocket-model-nozzle">0.35 in</dd></div><div><dt>Water discharge coefficient</dt><dd>0.86</dd></div><div><dt>Drag coefficient</dt><dd>0.42</dd></div></dl>' +
      '<h3>The shared water solver</h3><p>The visible water consists only of resident particles in the shared WebGPU liquid engine. The pressure model removes mass from the bottle in matched particle quanta and gives those same particles nozzle velocity. The solver handles their motion and ground contact after exit. Occasional numerically unstable splash particles are omitted from the display.</p>' +
      '<h3>What this model leaves out</h3><p>The bottle-local water is simulated in a fixed reference frame, so acceleration does not produce real sloshing. The air has one pressure and temperature. The bottle can tip and settle at impact, but the attitude and ground contact are approximate. There is no wind.</p>' +
      '<p>The bottle is enlarged in flight so you can see it. The altitude scale follows its calculated position. This is an illustrative simulation, not a prediction for a real bottle or launcher.</p>' +
      '<p class="rocket-method-links"><a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/flight-of-a-water-rocket/" target="_blank" rel="noopener">NASA: water rocket flight</a><a href="https://people.ohio.edu/urieli/thermo/property_tables/gas/adiabatic/rocket/rocket.html" target="_blank" rel="noopener">The flight equations</a></p>';
    document.getElementById('toy-panel-instruments').appendChild(method);
    var canvas = panel.querySelector('canvas'), view = root.WSSWaterRocketView.create(canvas);
    var waterCount = 0, residentWater = 0, waterBirthAltitudes = [];
    function seedNativeWater() {
      var grains = [], fillHeight = Math.round(model.state.fillFraction * 145);
      for (var y = 346.75; y >= 348 - fillHeight; y -= 1.25) for (var x = 100; x < 220; x += 1.25)
        grains.push({x:x + ((y / 1.25 | 0) % 2) * .625,y:y});
      waterCount = water.reset(grains); residentWater = waterCount;
      waterBirthAltitudes = new Float32Array(waterCount);
    }
    seedNativeWater();
    function releaseNativeWater() {
      var s = model.state, events = s.exhaustEvents || [];
      if (!waterCount || !events.length) return;
      var target = Math.min(waterCount, Math.floor((s.waterExpelledMass / s.initialWaterMass) * waterCount + 1e-8));
      for (var i = 0; i < events.length && residentWater > waterCount - target; i++) {
        var event = events[i], cumulative = i === events.length - 1 ? target : Math.min(target,
          Math.floor(((s.waterExpelledMass - events.slice(i + 1).reduce(function(a,e){return a+e.mass;},0)) / s.initialWaterMass) * waterCount));
        while (residentWater > waterCount - cumulative) {
          var index = --residentWater, spread = ((index * 37) % 7 - 3) * .18;
          waterBirthAltitudes[index] = event.altitude;
          water.relocate(index, 360 + spread, Math.max(32, 348 - event.altitude * 4),
            spread * 2, (event.exhaustVelocity - event.velocity) * 4);
        }
      }
    }
    var fill = panel.querySelector('#rocket-fill'), pump = panel.querySelector('#rocket-pump');
    var latch = panel.querySelector('#rocket-latch'), next = panel.querySelector('#rocket-next');
    var slow = panel.querySelector('#rocket-slow'), pumping = false;
    fill.value = Math.round(definition.rocketOptions.fillFraction * 100);
    var metric = false, best = 0, previousPeak = 0, flightCount = 0, recorded = false, retired = false, lastPhase = '';
    var label = {ready: 'On the launch pad', charging: 'Pumping air', armed: 'Collar locked', powered: 'Under thrust', coasting: 'Coasting upward', descending: 'Falling back', settling: 'Ground contact', landed: 'At rest'};
    var guidance = {ready: 'Set the water level, hold the pump, then release the collar.', charging: 'Air enters the bottle while you hold the pump.', armed: 'Release the collar when you are ready.', powered: 'Expelled water pushes the bottle upward.', coasting: 'Momentum carries it upward after thrust ends.', descending: 'Gravity and drag bring it back.', settling: 'The bottle is contacting the ground.', landed: 'Set up again for another flight.'};
    function text(id, value) {var element = panel.querySelector('#' + id); if (element.textContent !== value) element.textContent = value;}
    function paused() {return !!(root.__toy && root.__toy.stats().paused);}
    function setOptions() {
      model.reset({fillFraction: +fill.value / 100, targetPressurePsi: 90});
      seedNativeWater(); recorded = false; view.destroy(); view = root.WSSWaterRocketView.create(canvas); sync(); render();
    }
    function action() {
      if (paused()) return true;
      if (model.state.phase === 'ready' || model.state.phase === 'armed') {model.charge(); model.pumpStroke(); model.stopCharge();}
      else if (model.state.phase === 'landed') setOptions();
      sync(); render(); return true;
    }
    function startPump(event) {
      if (paused() || !model.charge()) return;
      if (event && event.pointerId !== undefined) pump.setPointerCapture(event.pointerId);
      model.pumpStroke(); pumping = true; render();
    }
    function stopPump() {
      if (!pumping) return;
      pumping = false; model.stopCharge(); render();
    }
    function sync() {
      var s = model.state, phase = s.phase, locked = phase !== 'ready', stopped = paused();
      definition.waterRocketReading = s;
      panel.dataset.phase = phase; panel.classList.toggle('is-paused', stopped);
      slow.checked = !!(root.__toy && root.__toy.stats().timeScale === .25);
      fill.disabled = locked;
      definition.action = 'Pump air';
      pump.disabled = stopped || (phase !== 'ready' && phase !== 'charging' && phase !== 'armed');
      latch.disabled = stopped || phase !== 'armed';
      next.hidden = phase !== 'landed';
      text('rocket-fill-value', fill.value + '%');
      fill.setAttribute('aria-valuetext', fill.value + ' percent water');
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
      if (phase === 'landed' && !recorded) {previousPeak = s.peakAltitude; best = Math.max(best, previousPeak); flightCount++; recorded = true;}
      if (flightCount) {
        var distance = (previousPeak * (metric ? 1 : 3.28084)).toFixed(1) + (metric ? ' m' : ' ft');
        text('rocket-record-label', 'Flight ' + String(flightCount).padStart(2, '0'));
        text('rocket-record-value', distance + ' at the top');
        text('rocket-record-note', 'Best this session: ' + (best * (metric ? 1 : 3.28084)).toFixed(1) + (metric ? ' m.' : ' ft.') + ' Change the fill or pump longer to compare.');
      }
    }
    function render() {
      if (retired) return;
      sync();
      var bounds = canvas.parentElement.getBoundingClientRect();
      var controls = view.render(model.state, {width: bounds.width, height: bounds.height, unit: metric ? 'metric' : 'imperial', previousPeak: recorded ? 0 : previousPeak, best: best, paused: paused(), slow: slow.checked, fillFraction: +fill.value / 100, nativeWater: water.snapshot(), residentWater: residentWater, waterBirthAltitudes: waterBirthAltitudes});
      if (controls) {
        [['rocket-pump', controls.pump], ['rocket-latch', controls.latch], ['rocket-fill-control', controls.fill], ['rocket-next', controls.next]].forEach(function (entry) {
          var element = panel.querySelector('#' + entry[0]);
          element.style.left = entry[1].x + 'px'; element.style.top = entry[1].y + 'px';
        });
      }
    }
    fill.addEventListener('input', setOptions);
    pump.addEventListener('pointerdown', startPump);
    pump.addEventListener('pointerup', stopPump);
    pump.addEventListener('pointercancel', stopPump);
    pump.addEventListener('lostpointercapture', stopPump);
    pump.addEventListener('keydown', function(event) {if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {event.preventDefault(); startPump();}});
    pump.addEventListener('keyup', function(event) {if (event.key === ' ' || event.key === 'Enter') {event.preventDefault(); stopPump();}});
    latch.addEventListener('click', function () {if (!paused() && model.launch()) render();});
    next.addEventListener('click', setOptions);
    window.addEventListener('blur', stopPump);
    panel.querySelector('#rocket-units').addEventListener('click', function (event) {metric = !metric; event.currentTarget.setAttribute('aria-pressed', String(metric)); render();});
    slow.addEventListener('change', function () {root.__toy.set('time', slow.checked ? .25 : 1); render();});
    var resize = new ResizeObserver(render); resize.observe(panel);
    var pauseObserver = new MutationObserver(render); pauseObserver.observe(shell, {attributes: true, attributeFilter: ['class']});
    var runtime = {
      smoke: false, primary: action, clock: function () {return model.state.elapsed;},
      tick: function (dt) {if (paused()) stopPump(); model.step(dt * (root.__toy ? root.__toy.stats().timeScale : 1)); releaseNativeWater(); sync();}, render: render,
      stats: function () {return model.snapshot();},
      waterStats: function () {var sample=water.snapshot(), bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
        for(var i=0;i<residentWater;i++){bounds.minX=Math.min(bounds.minX,sample.x[i]);bounds.maxX=Math.max(bounds.maxX,sample.x[i]);bounds.minY=Math.min(bounds.minY,sample.y[i]);bounds.maxY=Math.max(bounds.maxY,sample.y[i]);}
        return {particles:sample.count, resident:residentWater, emitted:waterCount-residentWater,
          quantumKg:waterCount ? model.state.initialWaterMass/waterCount : 0,
          reservoirBounds:bounds,readbackAge:water.readbackAge()};},
      destroy: function () {retired = true; window.removeEventListener('blur', stopPump); resize.disconnect(); pauseObserver.disconnect(); view.destroy(); panel.remove(); method.remove(); shell.classList.remove('has-water-rocket'); if (root.WSSWaterRocket.active === runtime) root.WSSWaterRocket.active = null;}
    };
    root.WSSWaterRocket.active = runtime; render(); return runtime;
  }};
  root.WSSMachines = root.WSSMachines || {};
  root.WSSMachines['water-rocket'] = {make: make}; root.WSSWaterRocket = {make: make, active: null};
})(typeof window !== 'undefined' ? window : globalThis);
