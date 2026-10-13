/* Presentation only. Preset controls and simulation stay in the demo host. */
(function () {
  'use strict';

  function init() {
    var toy = window.__toy;
    var shell = document.getElementById('toy');
    if (!toy || !shell || !document.getElementById('toy-fallback').hidden) return;
    // The app page is always full-window; its fullscreen button uses the browser's fullscreen.
    var submarineControls=window.WSSSubmarineControls ? window.WSSSubmarineControls.create(toy,shell) : null;
    var appMode = document.body.classList.contains('toy-app');
    var oxygenView = window.WSSOxygenView ? window.WSSOxygenView.create(toy, shell) : null;
    if (oxygenView) toy.oxygenView = oxygenView;
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
    // A draft's state reads as a small tag beside its name. The list builder
    // writes it as a bracketed suffix, and the cue's draft markers repeat it.
    var draftStates = { 'Working': 'WORKS', 'Partly working': 'PARTLY', 'Not working yet': 'NOT WORKING' };
    picker.querySelectorAll('.toy-scene-name').forEach(function (name) {
      var match = /^(.*) \[(Working|Partly working|Not working yet)\]$/.exec(name.textContent);
      if (!match) return;
      name.textContent = match[1];
      var tag = document.createElement('span');
      tag.className = 'toy-scene-status'; tag.dataset.status = draftStates[match[2]]; tag.textContent = match[2];
      name.after(tag);
      var cue = name.parentElement.querySelector('.toy-scene-cue');
      if (cue) cue.textContent = cue.textContent.replace(/^Draft\.\s*/, '').replace(/,\s*draft\.$/, '.');
    });
    var sceneLabel = document.getElementById('toy-scene-label');
    var lastScene = null;
    var buildKind = 'pipe';
    var notice = '';
    var rejectedLinkError = new URLSearchParams(location.search).has('build') && toy.buildState ? toy.buildState().error : null;
    var dismissedLinkError = null;
    var pressureColors = false;
    var airPressureColors = toy.airPressureView();
    var glassWalls = true;
    var slowMotion = false;
    var valveSignature = null;
    var handsNote=null;
    if(toy.buildState && toy.buildState().handsLab){
      var punch=document.createElement('button');punch.className='toy-chip';punch.dataset.buildTool='punch';
      punch.setAttribute('aria-pressed','false');punch.textContent='Hole punch';
      document.querySelector('#toy-panel-build .toy-build-tools').appendChild(punch);
      handsNote=document.createElement('p');handsNote.className='toy-hands-note';
      document.querySelector('#toy-panel-build .toy-build-tools').after(handsNote);
    }
    var playback = shell.querySelector('.toy-playback');
    var actionLayer = document.getElementById('toy-scene-actions');
    var actionButtons = new Map();
    var activeHeldButton = null;
    var caveIndicator=document.getElementById('toy-cave-indicator');
    var caveHold=null,caveHoldFrame=null;
    function releaseCavePressure(event){
      if(!caveHold || event && event.pointerId!==undefined && event.pointerId!==caveHold.pointer)return;
      var held=caveHold;caveHold=null;
      if(caveHoldFrame!==null){demoActivity.cancelFrame(caveHoldFrame);caveHoldFrame=null;}
      held.button.setAttribute('aria-pressed','false');
      if(held.pointer!==null && held.button.hasPointerCapture(held.pointer))held.button.releasePointerCapture(held.pointer);
    }
    function raiseHeldCavePressure(now){
      caveHoldFrame=null;
      if(!caveHold)return;
      var model=toy.breathingCave(),state=toy.stats();
      if(state.scene!=='breathing-cave' || state.loading || model!==caveHold.model || !demoActivity.active()){
        releaseCavePressure();return;
      }
      // A short press is one step. After a brief hold, pressure grows with
      // active elapsed time, independent of frame rate and manual pause.
      if(now>caveHold.start+250){
        var elapsed=Math.min(100,now-Math.max(caveHold.last,caveHold.start+250));
        if(elapsed>0)toy.cavePressure(caveHold.button.dataset.cavePressure,elapsed*.001*model.stats().pressureHoldRatePaPerSecond);
      }
      caveHold.last=now;caveHoldFrame=demoActivity.requestFrame(raiseHeldCavePressure);
    }
    function holdCavePressure(button,pointer,key){
      if(button.disabled || caveHold || !demoActivity.active())return;
      var now=demoActivity.now();
      caveHold={button:button,pointer:pointer,key:key,start:now,last:now,model:toy.breathingCave()};
      button.setAttribute('aria-pressed','true');
      toy.cavePressure(button.dataset.cavePressure);sync();
      caveHoldFrame=demoActivity.requestFrame(raiseHeldCavePressure);
    }
    if(caveIndicator)caveIndicator.querySelectorAll('[data-cave-pressure]').forEach(function(button){
      button.addEventListener('pointerdown',function(event){
        if(event.button!==0 || button.disabled || caveHold)return;
        event.preventDefault();button.focus({preventScroll:true});button.setPointerCapture(event.pointerId);
        holdCavePressure(button,event.pointerId,null);
      });
      ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){button.addEventListener(name,releaseCavePressure);});
      button.addEventListener('keydown',function(event){
        if(event.key!==' ' && event.key!=='Enter')return;
        event.preventDefault();if(!event.repeat)holdCavePressure(button,null,event.key);
      });
      button.addEventListener('keyup',function(event){
        if(caveHold && caveHold.button===button && caveHold.key===event.key){event.preventDefault();releaseCavePressure();}
      });
      button.addEventListener('blur',function(){if(caveHold && caveHold.button===button)releaseCavePressure();});
      button.addEventListener('contextmenu',function(event){event.preventDefault();});
      button.addEventListener('click',function(event){
        // Screen readers can invoke click without a pointer or keyboard hold.
        // Ordinary release clicks must not add a second pressure step.
        if(event.detail===0 && !caveHold){toy.cavePressure(button.dataset.cavePressure);sync();}
      });
    });
    function syncCaveIndicator(sample,state){
      if(!caveIndicator)return null;
      caveIndicator.hidden=state.scene!=='breathing-cave';
      if(caveIndicator.hidden){releaseCavePressure();return null;}
      var ready=sample && !sample.error && Number.isFinite(sample.gaugePressurePa) && Number.isFinite(sample.speedMetersPerSecond);
      if(!ready || caveHold && toy.breathingCave()!==caveHold.model)releaseCavePressure();
      var speed=ready?sample.speedMetersPerSecond:0;
      caveIndicator.querySelectorAll('[data-cave-pressure]').forEach(function(button){button.disabled=!ready;});
      var flow=!ready?'loading':!sample.mouthOpen?'closed':Math.abs(speed)<.2?'still':speed>0?'out':'in';
      var labels={loading:sample && sample.error?'Airflow stopped':'Starting',closed:'Mouth closed',still:'Air nearly still',out:'Air flowing out',in:'Air flowing in'};
      if(ready && flow==='still' && Math.abs(speed)<.001)labels.still='Air still';
      caveIndicator.dataset.flow=state.paused?'paused':flow;
      text('toy-cave-flow',labels[flow]);
      document.getElementById('toy-cave-paused').hidden=!state.paused;
      var delta=ready?sample.gaugePressurePa/100:0,higher=Math.abs(delta)<.05?'equal':delta>0?'cave':'outside';
      var pressureText=!ready?'Waiting for pressure':higher==='equal'?'Pressures are balanced':
        (higher==='cave'?'Cave':'Outside')+' higher by '+Math.abs(delta).toFixed(1)+' hPa';
      text('toy-cave-pressure-text',pressureText);
      var meter=document.getElementById('toy-cave-meter');
      meter.dataset.higher=higher;
      meter.style.setProperty('--pressure-size',(Math.min(60,Math.abs(delta))/60*50)+'%');
      meter.setAttribute('aria-valuenow',Math.max(-60,Math.min(60,delta)).toFixed(2));
      meter.setAttribute('aria-valuetext',pressureText);
      var reversing=ready && (flow==='out' && delta<-.05 || flow==='in' && delta>.05);
      text('toy-cave-context',!ready?'The cave is starting.':caveHold?'Raising '+caveHold.button.dataset.cavePressure+' pressure. Release to stop.':state.paused?'Airflow is paused. You can still raise either pressure.':flow==='closed'?'The shut entrance traps the cave air.':
        reversing?'Moving air takes a moment to reverse.':flow==='still'?'Tap for +10 hPa. Hold to keep raising it.':'Air moves toward the lower pressure.');
      return {label:labels[flow],flow:flow};
    }
    var sluiceControls=window.WSSSluiceControls ? window.WSSSluiceControls.create(toy,shell) : null;
    var sceneHints = {
      falls: 'Drop a slime into the falling water.',
      zerog: 'Pull a slime through the floating water.',
      chimney: 'Move a slime into a plume and watch it split.',
      spa: 'Drop the top slime into the pool.',
      rig: 'Try an exhaust at idle, on the move, or under boost.',
      blank: 'Choose a material to add, or draw your own container.',
      siphon: 'Open the valve, then watch the two water levels.',
      cup: 'Drop the slime in, then watch the fill line.',
      heron: 'Open the valve to start. Compare the jars in Instruments.',
      'self-flushing-cup':'Watch the fill line. Instruments has the tap-off and vented comparisons.',
      tantalus:'Watch the fixed mouth line while the cup fills and drains.',
      'thumb-straw':'Hold the straw’s top to seal it. Release to open it.'
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
      nozzle: 'Drag across an outlet to narrow it. Pipe bore sets the nozzle opening.',
      punch:'Tap a wall to open one cell. Undo moves current water clear before restoring it.'
    };
    function nativeScene(name) {
      return !!(window.WSSMachineRegistry && window.WSSMachineRegistry.lookup(name));
    }
    function nativeSetupOptions(value) {
      var current=toy.machineState(),choices=current && current.definition.setups;
      var choice=choices && choices.find(function(item){return item.id===value;});
      if(current && current.definition.name==='sewer-gas-trap' && choice)return Object.assign({},choice.options,{fanOff:current.definition.draftFireSmoke.fan.enabled===false});
      if(current && current.definition.sluice){var d=current.definition.sluice;return Object.assign({lengthInches:d.lengthInches,slope:d.slope,riffleHeight:d.riffleHeight,initialCharge:d.initialCharge,seed:current.seed,matched:false,riffles:true},choice?choice.options:{});}
      return choice ? Object.assign({},choice.options) : {vented:value==='vented',tapEnabled:value!=='tap-off',secondHole:value==='second-hole'};
    }
    var nativeSetupScene=null,controlPointer=null,controlKeyboard=false;
    var sceneNames = { 'self-flushing-cup':'Self-flushing cup',tantalus:'Tantalus','thumb-straw':'The straw and the thumb', falls: 'Cascade', zerog: 'Drift', chimney: 'Plumes', rig: 'Rig exhaust', spa: 'Spring', blank: 'Empty', siphon: 'Siphon', cup: 'Greedy cup', heron: "Heron's fountain" };

    function text(id, value) {
      var element = document.getElementById(id);
      if (element.textContent !== value) element.textContent = value;
    }
    function pressed(button, active) {
      button.setAttribute('aria-pressed', String(active));
      if (button.classList.contains('is-on') !== active) button.classList.toggle('is-on', active);
    }
    function controlsHeight() {
      var dock=shell.querySelector('.toy-dock'),dockStyle=getComputedStyle(dock),position=dockStyle.position;
      // A vertical tool rail gets its own gutter, so it never covers the apparatus.
      var rail=appMode && dockStyle.display!=='none' && position==='absolute' && dockStyle.flexDirection==='column';
      // A world that fills the window runs under the rail; the host keeps a
      // machine's frame clear of the rail's right edge instead.
      var railRight=rail ? Math.ceil(dock.getBoundingClientRect().right)+'px' : '0px';
      if(shell.classList.contains('has-rail')!==rail || shell.style.getPropertyValue('--toy-rail-right')!==railRight){
        shell.classList.toggle('has-rail',rail);shell.style.setProperty('--toy-rail-right',railRight);toy.resize();
      }
      var height = Math.ceil((position==='absolute' || position==='fixed' ? 0 : dock.getBoundingClientRect().height));
      shell.style.setProperty('--toy-top-height',shell.querySelector('.toy-top').getBoundingClientRect().height+'px');
      var value = height + 'px';
      if (shell.style.getPropertyValue('--toy-controls-height') !== value) {
        shell.style.setProperty('--toy-controls-height', value);
        toy.resize();
      }
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
      document.getElementById('toy-build-' + name).addEventListener('click', async function () {
        try { notice = await Promise.resolve(toy[name]()) ? '' : 'There is nothing to ' + name + '.'; }
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
    function releaseHeldControl(event){
      if(event && event.currentTarget && event.currentTarget.classList && event.currentTarget.classList.contains('toy-scene-action') && event.currentTarget!==activeHeldButton)return;
      if(event && event.pointerId!==undefined && event.pointerId!==controlPointer)return;
      var holding=controlKeyboard || controlPointer!==null;
      var button=activeHeldButton,captured=controlPointer;
      controlKeyboard=false;controlPointer=null;
      if(holding)toy.releaseMachineControl();
      if(activeHeldButton)activeHeldButton.setAttribute('aria-pressed','false');
      activeHeldButton=null;
      if(button && captured!==null && button.hasPointerCapture(captured))button.releasePointerCapture(captured);
    }
    function holdControl(button){
      activeHeldButton=button;button.setAttribute('aria-pressed','true');
      Promise.resolve(toy.activateMachineControl(button.dataset.control,true)).catch(function(error){notice=error.message;releaseHeldControl();});
    }
    function activateControl(button,event){
      try {
        var point;
        if(event && event.detail>0){
          var stageBounds=document.getElementById('toy-stage').getBoundingClientRect(),scale=toy.camera().scale;
          point={x:(event.clientX-stageBounds.left)/scale,y:(event.clientY-stageBounds.top)/scale};
        }
        Promise.resolve(toy.activateMachineControl(button.dataset.control,undefined,point)).then(updateMeasurements).catch(function(error){notice=error.message;updateMeasurements();});
      } catch(error){notice=error.message;updateMeasurements();}
    }
    function createActionButton(control){
      var button=document.createElement('button');
      button.type='button';button.className='toy-scene-action';button.dataset.control=control.id;
      var label=document.createElement('span');label.className='toy-scene-action-label';button.appendChild(label);
      button.addEventListener('click',function(event){if(button.dataset.hold!=='true')activateControl(button,event);});
      button.addEventListener('blur',releaseHeldControl);
      button.addEventListener('pointerdown',function(event){
        if(button.dataset.hold!=='true' || button.disabled || event.button!==0)return;
        if(controlPointer!==null || controlKeyboard)return;
        event.preventDefault();controlPointer=event.pointerId;button.setPointerCapture(event.pointerId);holdControl(button);
      });
      ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){button.addEventListener(name,releaseHeldControl);});
      button.addEventListener('keydown',function(event){
        if(button.dataset.hold!=='true' || ![' ','Enter'].includes(event.key))return;
        event.preventDefault();if(!event.repeat && !controlKeyboard && controlPointer===null){controlKeyboard=event.key;holdControl(button);}
      });
      button.addEventListener('keyup',function(event){if(button.dataset.hold==='true' && controlKeyboard===event.key){event.preventDefault();releaseHeldControl(event);}});
      actionLayer.appendChild(button);return button;
    }
    function syncMachineControls(){
      if(!toy.machineControls || !actionLayer)return;
      var state=toy.stats();
      if(activeHeldButton && (state.paused || state.tool!=='poke'))releaseHeldControl();
      // Holding refills the straw asynchronously. Keep its captured target
      // alive until construction finishes or the user releases it.
      if(activeHeldButton && state.loading)return;
      var controls=toy.machineControls();
      var viewport=document.getElementById('toy-viewport'),view=viewport.getBoundingClientRect(),stage=document.getElementById('toy-stage').getBoundingClientRect(),scale=toy.camera().scale;
      var guide=document.getElementById('toy-sand-guide');
      if(guide){
        guide.hidden=state.scene!=='sand-dam' || state.loading;
        if(!guide.hidden){
          guide.style.top=(Math.max(0,shell.querySelector('.toy-top').getBoundingClientRect().bottom-view.top)+12)+'px';
          var sand=toy.sandDamStats();
          text('toy-sand-result',sand.pouring ? 'Water running. Release the tap to stop.' : sand.admitted ? 'Watch the wet face. The dashed line marks the starting sand.' : 'Dry sand. The dashed line marks the starting bank.');
        }
      }
      var liveKeys=new Set();
      controls.forEach(function(control){
        var key=state.scene+':'+control.id;liveKeys.add(key);
        var button=actionButtons.get(key);
        if(!button){button=createActionButton(control);actionButtons.set(key,button);}
        var width=Math.max(control.pointerMode==='button'?140:44,control.width*scale),height=Math.max(44,control.height*scale);
        var centerX=stage.left-view.left+control.x*scale,centerY=stage.top-view.top+control.y*scale;
        var topHeight=shell.querySelector('.toy-top').getBoundingClientRect().bottom-view.top;
        button.hidden=control.disabled || state.tool!=='poke' || centerX<0 || centerX>view.width || centerY<topHeight || centerY>view.height;
        var left=Math.max(0,Math.min(view.width-width,centerX-width*.5));
        var top=Math.max(topHeight,Math.min(view.height-height,centerY-height*.5));
        button.style.left=left+'px';button.style.top=top+'px';button.style.width=width+'px';button.style.height=height+'px';
        button.classList.toggle('is-body-action',control.pointerMode==='tap-body');
        button.classList.toggle('is-button-action',control.pointerMode==='button');
        var fieldAction=control.pointerMode==='seal' || control.pointerMode==='airflow';
        button.classList.toggle('is-field-action',fieldAction);
        button.classList.toggle('is-inlet-action',control.pointerMode==='airflow');
        var heldControl=/^(thumb|fire-pour|pour|sluice-feed)$/.test(control.kind);
        button.dataset.hold=String(heldControl);
        button.disabled=!!control.disabled;
        button.setAttribute('aria-label',control.label);
        var label=button.firstElementChild;if(label.textContent!==control.label)label.textContent=control.label;
        var labelWidth=label.offsetWidth,labelHeight=label.offsetHeight,labelCenter=left+width*.5;
        var fittedCenter=Math.max(8+labelWidth*.5,Math.min(view.width-8-labelWidth*.5,labelCenter));
        button.style.setProperty('--action-label-shift',(fittedCenter-labelCenter)+'px');
        button.classList.toggle('is-label-above',control.pointerMode==='airflow' || top+height+4+labelHeight>view.height-8);
        if(heldControl)button.setAttribute('aria-pressed',String(activeHeldButton===button && (controlPointer!==null || !!controlKeyboard)));
        else if(control.pressed!==undefined)button.setAttribute('aria-pressed',String(control.pressed));
        else button.removeAttribute('aria-pressed');
      });
      actionButtons.forEach(function(button,key){if(!liveKeys.has(key)){if(activeHeldButton===button)releaseHeldControl();button.remove();actionButtons.delete(key);}});
    }
    window.addEventListener('blur',releaseHeldControl);
    document.addEventListener('visibilitychange',function(){if(document.hidden)releaseHeldControl();});
    document.getElementById('toy-pause').addEventListener('click',releaseHeldControl);
    window.addEventListener('resize',syncMachineControls);
    document.getElementById('toy-native-setup').addEventListener('change',async function(){
      var scene=toy.stats().scene,value=this.value;this.disabled=true;releaseHeldControl();
      try{
        if(scene==='sewer-gas-trap'){
          if(value!==toy.machineState().definition.setup)await toy.machinePrimary();
        }else await toy.machine(scene,nativeSetupOptions(value));
      }
      catch(error){notice=error.message;}
      finally{this.disabled=false;updateMeasurements();}
    });
    document.getElementById('toy-sound').addEventListener('click',function(){
      var enabled=toy.soundStats().enabled;
      toy.sound(!enabled).catch(function(error){notice=error.message;});
    });
    document.getElementById('toy-siphon-setup').addEventListener('change', async function () {
      var setup=this.value;
      this.disabled=true;
      try { await toy.machine('siphon',{setup:setup}); }
      catch(error){notice=error.message;}
      finally{this.disabled=false;updateMeasurements();}
    });
    document.getElementById('toy-heron-setup').addEventListener('change', async function () {
      var setup=this.value;
      this.disabled=true;
      try { await toy.machine('heron',{setup:setup}); }
      catch(error){notice=error.message;}
      finally{this.disabled=false;updateMeasurements();}
    });
    document.getElementById('toy-pressure-toggle').addEventListener('click', function () {
      pressureColors = !pressureColors; toy.pressureView(pressureColors); pressed(this, pressureColors); updateMeasurements();
    });
    ['toy-air-pressure-toggle','toy-air-pressure-compact'].forEach(function(id){
      document.getElementById(id).addEventListener('click',function(){
        airPressureColors=toy.airPressureView(!toy.airPressureView());updateMeasurements();
      });
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
      if(submarineControls)submarineControls.sync();
      if(sluiceControls)sluiceControls.update();
      if (oxygenView) oxygenView.update();
      var state = toy.stats(), native=nativeScene(state.scene),machine = /^(siphon|cup|heron)$/.test(state.scene) || native;
      text('toy-fps', state.fps + ' FPS');
      var sample = toy.instruments ? toy.instruments() : { ready: false };
      var liveMachine = toy.machineState ? toy.machineState() : null;
      var air = toy.airStats ? toy.airStats() : { enabled: false };
      var cave=state.scene==='breathing-cave',caveReading=sample.cave;
      var caveView=syncCaveIndicator(caveReading,state);
      var fire=!!(liveMachine && liveMachine.definition.fire);
      var trap=state.scene==='sewer-gas-trap',marly=state.scene==='marly-machine';
      document.getElementById('toy-trap-physics').hidden=!trap;
      var candle=fire && !!liveMachine.definition.fire.air;
      var slip=!!(liveMachine && liveMachine.definition.materialSlip),sluice=!!(liveMachine && liveMachine.definition.sluice);
      var steam=!!(liveMachine && liveMachine.definition.steam);
      var birds=!!(liveMachine && liveMachine.definition.birds);
      var wind=state.scene==='smoke-wind-tunnel',cannon=state.scene==='smoke-ring-cannon'||wind,thermal=state.scene==='thermoscope',balloon=state.scene==='water-balloons',divers=state.scene==='cartesian-divers',bubbles=state.scene==='air-hose';
      var thirsty=!!(liveMachine && liveMachine.definition.thirsty);
      var waterRocket=!!(liveMachine && liveMachine.definition.waterRocketModel);
      var railway=!!(liveMachine && liveMachine.definition.ballastRailway);
      var nativeReduced=!!(liveMachine && (liveMachine.definition.thermal || liveMachine.definition.capillary || liveMachine.definition.gasBodyLab || liveMachine.definition.objective || liveMachine.definition.floatingBlock || liveMachine.definition.wheel || railway || liveMachine.definition.marly));
      var nativeCargo=!!(liveMachine && (liveMachine.definition.submarine || liveMachine.definition.cuff || liveMachine.definition.rocket));
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
        'The pressure sample is current. Open Instruments for the calculation status.';
      if(liveMachine && (liveMachine.definition.airContact || liveMachine.definition.snorkel || liveMachine.definition.gasBodyLab)){pressureLabel=fatal?'Pressure stopped':state.paused?'Paused':'Reduced gas';pressureMessage=liveMachine.definition.readingLabel || liveMachine.definition.caption;}
      if(cave){pressureLabel=state.paused?'Paused':caveView?caveView.label:'Starting';pressureMessage='The airflow indicator compares pressure for you. Close the cave mouth or compare steady pressure in Instruments.';}
      if(thirsty){pressureLabel=state.paused?'Paused':sample.thirsty && sample.thirsty.ejecting?'Spraying':sample.thirsty && sample.thirsty.full?'Full':sample.thirsty && sample.thirsty.drinking?'Drinking':'Thirsty';pressureMessage='Drag either gold handle inward to send water jets out of the skin. Release to let it drink again.';}
      if(cannon){pressureLabel=state.paused?'Paused':'Live';pressureMessage=wind?'A steady fan drives the smoke past the supported slime.':'The smoke carries the push. Instruments explains the flat section.';}
      if(balloon){pressureLabel=state.paused?'Paused':'Live';pressureMessage='Drag, fling and pop. Instruments explains the elastic skin.';}
      if(slip){pressureLabel=state.paused?'Paused':state.scene==='material-oil-jar'||sluice||(window.WSSMachineRegistry&&window.WSSMachineRegistry.lookup(state.scene)?.status==='WORKS')?'Live':'Prototype';pressureMessage='Instruments has the matched-density comparison and model limits.';}
      if(steam){pressureLabel=state.paused?'Paused':'Diagnostic';pressureMessage=birds?'Grab the pipe’s top to change its note. Instruments has the comparisons and acoustic limits.':'The white plume traces escaping vapor. Instruments explains the thermal model.';}
      if(nativeReduced){var reducedError=fatal || sample.boundary && sample.boundary.error || sample.draftRuntime && sample.draftRuntime.error;pressureLabel=reducedError?'Solver stopped':state.paused?'Paused':sample.ready?'Live':'Starting';pressureMessage=reducedError?'Restart to restore the native solver.':(liveMachine.definition.gasBodyLab || liveMachine.definition.objective || liveMachine.definition.floatingBlock || liveMachine.definition.wheel || railway || liveMachine.definition.marly)?liveMachine.definition.readingLabel:'Instruments has the material model and its comparisons.';}
      if(railway && !reducedError){pressureLabel=state.paused?'Paused':liveMachine.ready?liveMachine.definition.readingLabel:'Starting';pressureMessage=liveMachine.definition.caption;}
      if(marly){pressureLabel=state.paused?'Paused':liveMachine && liveMachine.definition.readingLabel || 'Starting';pressureMessage='Change the river flow or apply the brake. The valves hold the raised water.';}
      if(nativeCargo){var cargoDefinition=liveMachine.definition,cargoReading=cargoDefinition.rocketReading || cargoDefinition.cuffReading || cargoDefinition.submarineReading,cargoError=fatal || cargoReading && cargoReading.error;pressureLabel=cargoError?'Solver stopped':state.paused?'Paused':!liveMachine.ready || !cargoReading?'Starting':cargoDefinition.rocket?'Diagnostic':'Live';pressureMessage=cargoError?'Restart to restore the native solver.':'Instruments explains the carried-water or gas-body model and its comparisons.';}
      if(waterRocket){pressureLabel=state.paused?'Paused':'Live';pressureMessage=liveMachine.definition.caption;}
      if(trap){
        var trapFan=liveMachine && liveMachine.definition.draftFireSmoke.fan.enabled;
        pressureLabel=state.paused?'Paused':liveMachine && liveMachine.definition.setup==='dry'?'Trap dry':'Water seal';
        if(!trapFan && !state.paused)pressureLabel+=', airflow off';
        pressureMessage=liveMachine && liveMachine.definition.caption || 'Starting the comparison.';
        text('toy-hint',pressureMessage);
      }
      document.getElementById('toy-machine-diagnostics').hidden=!contextual || fire || balloon || thirsty || trap || railway;
      text('toy-machine-diagnostics',contextual ? pressureMessage : '');
      if(contextual)text('toy-status',state.loading ? 'Starting machine' : fire ? state.paused?'Paused':'Live' : pressureLabel || (state.paused ? 'Paused' : 'Live'));
      document.getElementById('toy-machine-scale').hidden=thirsty || trap || railway;
      document.getElementById('toy-machine-material-notice').hidden = !air.enabled;
      document.getElementById('toy-machine-summary').hidden = !machine || trap;
      document.getElementById('toy-machine-metrics').hidden = !machine || marly || fire || cannon || balloon || slip || cave || trap || thirsty || waterRocket || railway || !!(liveMachine && (liveMachine.definition.airContact || liveMachine.definition.snorkel || liveMachine.definition.gasBodyLab));
      if(fire)text('toy-hint',liveMachine.definition.sauna ? 'Click the water source or the stones to make steam. Let the room cool between pours.' : candle?'Lift the lid before the flame goes out. Reset lights a fresh candle.':'Click the upper water source or the fire to pour. You can also splash it with Water.');
      if(thirsty || railway)text('toy-hint',pressureMessage);
      if(birds && state.tool==='poke')text('toy-hint','Grab the pipe’s top and slide it up for a lower note, down for a higher one.');
      if(cave)text('toy-hint','Hold inside or outside pressure to move the air. Release to stop raising it.');
      if(cannon)text('toy-hint',wind?'Grab the slime. Stop the fan to compare its wake.':'Tap the back. Drag the slime back into the swirl.');
      if(balloon)text('toy-hint','Drag the skin to fling it. Click it to pop and release the water.');
      if(state.scene==='air-hose')text('toy-hint','Stop the declared air source and watch the remaining gas.');
      if(divers)text('toy-hint','Squeeze and release. Grab a diver to move it.');
      if(slip)text('toy-hint',liveMachine.definition.sandDam?liveMachine.definition.caption:sluice?liveMachine.definition.caption:'Stir once. Compare the same jar with matched material densities in Instruments.');
      document.getElementById('toy-material-slip-sources').hidden=!slip;
      if(state.scene==='float-slider-cistern')text('toy-hint','Grab the float and pull it down to open the inlet. Instruments has the pinned-low comparison.');
      var siphon=state.scene==='siphon';
      document.getElementById('toy-siphon-options').hidden=!siphon;
      document.getElementById('toy-siphon-setup-note').hidden=!siphon;
      var setupSelect=document.getElementById('toy-siphon-setup');
      if(siphon && liveMachine && liveMachine.ready && !setupSelect.disabled)setupSelect.value=liveMachine.definition.setup;
      var heron=state.scene==='heron',fountainSelect=document.getElementById('toy-heron-setup');
      document.getElementById('toy-heron-options').hidden=!heron;
      document.getElementById('toy-heron-setup-note').hidden=!heron;
      if(heron && liveMachine && liveMachine.ready && !fountainSelect.disabled)fountainSelect.value=liveMachine.definition.setup || 'sealed';
      document.getElementById('toy-instruments-open').hidden = !contextual || marly;
      document.getElementById('toy-instruments-open').textContent=trap?'How it works':'Instruments';
      document.getElementById('toy-heading-instruments').textContent=trap?'How it works':'Instruments';
      document.getElementById('toy-numerical-status').hidden=trap;
      if ((!contextual || marly) && openPanel && openPanel.id === 'toy-panel-instruments') closePanel(false);
      if (machine) {
        text('toy-machine-caption', sample.caption || (liveMachine && liveMachine.definition.caption) || 'The apparatus is being assembled. Measurements will appear when it is ready.');
      }
      text('toy-compact-head-label',divers ? 'Under 1' : state.scene==='thumb-straw' || thermal || steam ? 'Air' : state.scene==='tantalus' ? 'Water to mouth' : 'Head');
      text('toy-compact-head', number(state.scene==='thumb-straw' || thermal || steam || divers ? sample.gasPressurePsi : state.scene==='tantalus' ? sample.mouthDistanceInches : sample.headInches, state.scene==='thumb-straw' || thermal || steam || divers ? 'psi' : 'in'));
      document.getElementById('toy-compact-head').parentElement.hidden=state.scene==='burst-disk' || bubbles || nativeReduced || nativeCargo;
      document.getElementById('toy-native-reading').hidden=!native;
      var fireReading=fire && sample.fire ? candle ? 'Oxygen '+(100*sample.fire.oxygenFraction).toFixed(1)+'%; '+(sample.fire.burning?'burning':'out, reset to relight') : 'Source '+Math.round(sample.fire.sourceC*1.8+32)+' degrees Fahrenheit; '+(sample.fire.burning?'burning':'cooling') : '';
      text('toy-native-reading',sample.floatSlider ? 'Inlet '+Math.round(100*sample.floatSlider.openness)+'% open; '+(sample.floatSlider.pinned?'float pinned':'guided float') : birds && sample.birds ? 'Air out '+number(sample.birds.massFlowGrainsPerSecond,'grains/s')+'; pipe '+sample.birds.pipeLengthInches.toFixed(2)+' in' : sample.bubbles ? 'Gas parcels '+sample.bubbles.points.length+'; '+sample.bubbles.surfaceExits+' surface exits' : steam && sample.steam ? 'Water '+number(Number.isFinite(sample.steam.waterTemperatureC) ? sample.steam.waterTemperatureC*1.8+32 : null,'degrees Fahrenheit')+'; vapor '+sample.steam.vaporParcels : balloon && sample.balloon ? sample.balloon.popped ? 'Skin popped' : Number.isFinite(sample.balloon.retainedFraction) ? 'Water held '+(100*sample.balloon.retainedFraction).toFixed(0)+'%' : 'Water inside the skin' : thermal && sample.thermoscope ? 'Air '+number(sample.thermoscope.temperatureF,'degrees Fahrenheit') : fire && sample.fire ? fireReading : state.scene==='thumb-straw' ? Number.isFinite(sample.retainedFraction) ? 'Water held '+(100*sample.retainedFraction).toFixed(0)+'%' : 'Waiting for water sample' :
        cave && caveReading ? 'Cave '+(caveReading.pressurePa/100).toFixed(1)+' hPa; outside '+(caveReading.outsidePressurePa/100).toFixed(1)+' hPa; '+Math.abs(caveReading.speedMetersPerSecond).toFixed(1)+' m/s '+(caveReading.flowM3PerSecond>=0?'out':'in') : liveMachine && liveMachine.definition.readingLabel || 'Powered return');
      document.getElementById('toy-native-options').hidden=!native || state.scene==='hourglass';
      document.querySelector('#toy-native-options > p').textContent=trap ? 'Each switch changes only the water. Existing smoke and air keep moving.' : thirsty ? 'Water off starts with a dry slime and no water. Restart restores the selected setup.' : slip ? 'The comparison changes only the relative phase masses, keeping the same native population, walls, bulk stress and drag.' : state.scene==='float-slider-cistern' ? 'Pinning the float keeps the same water and supply while preventing inlet closure. The flush outlet stays shut in this checkpoint.' : birds ? 'Closing the feed stops new filling; capping the whistle blocks air transfer. Drag the pipe to change its mode estimate. Acoustic load does not feed back into airflow; this precursor has no owl mechanism or repeating cycle.' : bubbles ? 'The air-off setup admits no gas. Both setups begin with the same native water.' : steam ? 'Each setup starts with the same hot water. No heater makes no vapor; settling water can still push dry air through the whistle. Capped closes the gas port.' : divers ? 'The open side vent releases the piston pressure to room air. Each setup starts with fresh divers and water.' : balloon ? 'Choosing a setup starts a fresh partly filled balloon. The slit removes one lower-side edge, above the basin floor.' : thermal ? 'Compare the sealed bulb with no heat or an open upper vent. Each setup starts with the same water.' : cave ? 'Each setup starts with the same finite air. Steady pressure removes the outside weather cycle; closed mouth traps the initial air.' : wind ? 'Both setups supply smoke at the inlet; fan off supplies no air impulse.' : cannon ? 'Choosing a setup refills the smoke chamber. The no-push comparison starts with still air.' : liveMachine && liveMachine.definition.setupNote || 'Choosing a setup restarts it with the same initial water. Hold starts a freshly filled straw; releasing opens its top.';
      document.getElementById('toy-machine-view').hidden=native;
      var setup=document.getElementById('toy-native-setup');
      if(native && liveMachine && nativeSetupScene!==state.scene){
        nativeSetupScene=state.scene;setup.replaceChildren();
        var choices=liveMachine && liveMachine.definition.setups || (state.scene==='thumb-straw' ? [['released','Intact straw'],['second-hole','Second hole']] : [['tap-on','Tap running'],['tap-off','Tap off'],['vented','Vented crest']]).map(function(pair){return {id:pair[0],label:pair[1]};});
        choices.forEach(function(choice){
          var option=document.createElement('option');option.value=choice.id;option.textContent=choice.label;setup.appendChild(option);
        });
      }
      if(native && liveMachine && !setup.disabled){setup.value=liveMachine.definition.setup==='held' ? 'released' : liveMachine.definition.setup;}
      if(native && liveMachine){
        text('toy-native-setup-note',sluice ? 'Equal mineral densities makes black sand and gold as dense as quartz. Without riffles removes the raised bars. Each setup starts with the same water and grains.' : trap ? 'Switching changes only the water. The existing smoke, air motion and airflow setting stay in place.' : thirsty ? 'Water off starts with a dry slime and no water. Restart restores the selected setup.' : slip ? 'Matched densities repeats the same jar with equal parcel masses. Water and oil keep their different numerical filters.' : cave ? 'Changing a setup returns both pressures and the vanes to their starting values.' : liveMachine && liveMachine.definition.setupNote || 'Choosing a setup restarts it with the same initial water. Hold starts a freshly filled straw; releasing opens its top.');
        var b=liveMachine.definition.boundaries || {pool:false};
        text('toy-native-boundaries',liveMachine.definition.boundaryNote || (b.pool ? 'Drained water feeds the tap. The powered return adds energy to lift it. The tap requests '+b.tap.rate+' parcels per simulation second at '+b.tap.vy+' pixels per second downward; each parcel represents 1.5625 square pixels. All '+state.allocation+' allocated slots are either present water or stored reserve.' : 'Only the upper opening is held. The lower end stays open. The side-hole comparison connects the upper air space to the room.'));
        var ledger=sample.boundary, reduced=sample.draftRuntime;
        text('toy-native-ledger',railway && reduced && ledger ? 'Water parcels in car A: '+reduced.waterCounts[0]+'; car B: '+reduced.waterCounts[1]+'. Trips: '+reduced.trips+'; full cycles: '+reduced.cycles+'. Native inventory: '+ledger.present+' present, '+ledger.parked+' in reserve. Cable error: '+reduced.cableError.toFixed(6)+'.' : nativeReduced && ledger && reduced ? 'Native parcels: '+(ledger.present-(reduced.solidParcels || reduced.boundWaterParcels || 0))+' flowing, '+(reduced.solidParcels || reduced.boundWaterParcels || 0)+(liveMachine.definition.thermal?' solid.':' stored at roots.')+' Total '+ledger.count+'.' : sluice && sample.sluice ? 'Quartz washed '+sample.sluice.sand.washed+'/'+sample.sluice.sand.total+'; black sand remaining '+(sample.sluice.blackSand.total-sample.sluice.blackSand.washed)+'/'+sample.sluice.blackSand.total+'; gold remaining '+(sample.sluice.gold.total-sample.sluice.gold.washed)+'/'+sample.sluice.gold.total+'. Water added '+sample.sluice.admitted+'.' : thirsty && sample.thirsty && ledger ? 'Water parcels: '+(ledger.present-sample.thirsty.absorbedParcels)+' flowing, '+sample.thirsty.absorbedParcels+' absorbed, '+ledger.parked+' in reserve. Total '+ledger.count+'. Slime '+Math.round(sample.thirsty.fraction*100)+'% full.' : birds && sample.birds ? 'Whistle dry air: '+number(sample.birds.escapedDryGrains,'grains')+' expelled; '+number(sample.birds.admittedDryGrains,'grains')+' admitted. Native water parcels '+sample.birds.waterParcels+'.' : steam && sample.steam ? 'Water parcels: '+sample.steam.liquidParcels+' liquid, '+sample.steam.vaporParcels+' vapor, '+sample.steam.escapedVaporParcels+' escaped. Heat supplied '+number(sample.steam.heatInputJ/1.3558179483314,'ft·lbf')+'.' : cave && caveReading ? 'Air added '+number(caveReading.pumpedKg,'kg')+'; admitted '+number(caveReading.admittedKg,'kg')+'; expelled '+number(caveReading.escapedKg,'kg')+'; inventory error '+number(caveReading.massResidualKg,'kg')+'.' : b && b.pool && ledger ? 'Present '+ledger.present+'; reserve '+ledger.parked+'. Requested '+ledger.requested+'; admitted '+ledger.admitted+'; collected '+ledger.drained+'; refused '+ledger.shortfall+'. Return work '+number(ledger.externalWork,'J')+'.' : '');
      }
      var soundButton=document.getElementById('toy-sound'),sound=toy.soundStats ? toy.soundStats() : {enabled:false};
      soundButton.hidden=marly || waterRocket || cave || slip || birds || divers || balloon || bubbles || !native && !fire;pressed(soundButton,!!sound.enabled);soundButton.textContent=sound.enabled ? 'Sound on' : 'Sound off';
      soundButton.title=birds?'Airflow powers the tone. Grab the pipe top to change its estimated mode.':steam?'A pipe-mode whistle powered by escaping gas. Enable sound with this button.':fire?'A synthesized hiss from water cooling the source. Enable sound with this button.':'Synthesized water impacts. Enable sound with this button.';
      syncMachineControls();
      text('toy-compact-flow', number(sample.flowCubicInchesPerSecond, 'in³/s'));
      document.getElementById('toy-compact-flow').parentElement.hidden=divers || steam || bubbles || nativeReduced || nativeCargo;
      document.getElementById('toy-machine-metrics').classList.toggle('is-stale', stale);
      document.getElementById('toy-machine-metrics').title = stale ? 'The measurement sample is more than a quarter second old.' : '';
      text('toy-machine-scale', marly ? 'Simplified mechanical model. The lift is about 13 feet; the drawing is not to scale.' : sample.scaleText || 'The box is 30 inches wide and 1 inch deep. Seconds use Earth gravity.');
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
      text('toy-numerical-status', trap ? 'Smoke follows the air flow and the water boundary. Air pressure cannot push the water out of this trap.' : slip ? sample.numericalStatus : fire ? sample.fire && sample.fire.approximation || 'Loading the declared thermal model.' : fatal ? 'The pressure calculation stopped. These readings are diagnostic.' :
        unresolvedGeometry ? 'The water geometry is unresolved. These readings are diagnostic.' :
        sample.numericalStatus || 'Waiting for a pressure sample.');
      text('toy-energy-status', sample.energyBudgetStatus || 'Energy measurements will appear with the next apparatus sample.');
      slowMotion = +document.getElementById('toy-time').value === 25;
      pressed(document.getElementById('toy-slow-toggle'), slowMotion);
      var legend = document.getElementById('toy-pressure-legend');
      airPressureColors=toy.airPressureView();
      ['toy-air-pressure-toggle','toy-air-pressure-compact'].forEach(function(id){pressed(document.getElementById(id),airPressureColors);});
      legend.hidden = railway || thirsty || cave || fire || cannon || balloon || slip || !(pressureColors || airPressureColors) || !contextual;
      if (!legend.hidden) {
        var cap = window.WaterMachinesInstruments && toy.world ? window.WaterMachinesInstruments.scale({ width: toy.world().scaleWidth || toy.world().w }).psi(80000) : null;
        text('toy-pressure-legend', airPressureColors ? 'Air: gold above room pressure, rose below. Labels show gauge psi; room air is 0. Readings are diagnostic.' :
          'Water: rose below room pressure, gold above. Full color at ' + (Number.isFinite(cap) ? '±' + number(cap, 'psi') : 'the model limit') + '.');
      }
      document.querySelectorAll('#toy-panel-instruments > .toy-instrument-values, #toy-panel-instruments > .toy-details, #toy-panel-instruments .toy-instrument-actions + .toy-panel-note').forEach(function(node){if(node.hidden!==(marly||fire||cannon||balloon||steam||slip||cave||trap||thirsty||railway))node.hidden=marly||fire||cannon||balloon||steam||slip||cave||trap||thirsty||railway;});
      ['toy-air-pressure-toggle','toy-air-pressure-compact','toy-pressure-toggle'].forEach(function(id){document.getElementById(id).hidden=marly||fire||cannon||balloon||slip||cave||trap||thirsty||railway;});
      var builderState = toy.buildState ? toy.buildState() : {};
      var message = builderState.error || sample.error || notice;
      if(builderState.pending)message='Restoring the wall. Water and the clock are paused until the edit finishes.';
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
      if(submarineControls)submarineControls.sync();
      syncCamera();
      var state = toy.stats();
      var native=nativeScene(state.scene),wind=state.scene==='smoke-wind-tunnel',cannon=state.scene==='smoke-ring-cannon'||wind,thermal=state.scene==='thermoscope',balloon=state.scene==='water-balloons',divers=state.scene==='cartesian-divers',bubbles=state.scene==='air-hose';shell.classList.toggle('is-native-machine',native);
      shell.dataset.scene=state.scene;
      shell.classList.toggle('has-fire',!!toy.fire());
      var building = /^(build|draw|erase)$/.test(state.tool);
      shell.dataset.activeTool = state.tool;
      shell.classList.toggle('is-paused', state.paused);
      pauseButton.setAttribute('aria-pressed', String(state.paused));
      pauseButton.setAttribute('aria-label', state.paused ? 'Resume' : 'Pause');
      pauseButton.title = (state.paused ? 'Resume' : 'Pause') + ' (Space)';
      pauseButton.querySelector('path').setAttribute('d', state.paused ? 'm8 5 11 7-11 7Z' : 'M8 5v14M16 5v14');
      resumeButton.hidden = !state.paused || state.loading;
      var resumeParent=building ? playback : document.getElementById('toy-viewport');
      if(resumeButton.parentElement!==resumeParent)resumeParent.appendChild(resumeButton);
      var label = state.loading ? 'Starting machine' : state.paused ? 'Paused' : state.waterState === 'booting' ? 'Starting water' : 'Live';
      if (status.textContent !== label) status.textContent = label;
      var entry=window.WSSMachineRegistry && window.WSSMachineRegistry.lookup(state.scene);
      var instruction = state.tool === 'poke' ? (sceneHints[state.scene] || entry && entry.cue || hints.poke) : hints[state.tool] || hints.poke;
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
      text('toy-scene-label', sceneNames[state.scene] || entry && entry.title || state.scene);
      bar.querySelectorAll('[data-tool], [data-scene], [data-preset]').forEach(function (button) {
        button.setAttribute('aria-pressed', String(button.classList.contains('is-on')));
      });
      pressed(bar.querySelector('.toy-tools [data-tool="build"]'), building);
      var builderState = toy.buildState ? toy.buildState() : null;
      var hands=!!(builderState && builderState.handsLab);
      shell.classList.toggle('has-wall-editor',hands);
      bar.querySelectorAll('.toy-tools [data-tool]').forEach(function(button){button.hidden=false;});presetsButton.hidden=false;
      if(state.scene==='thirsty-slime' || state.scene==='ballast-railway'){bar.querySelectorAll('.toy-tools [data-tool]').forEach(function(button){button.hidden=button.dataset.tool!=='poke';});presetsButton.hidden=true;}
      if(cannon || thermal || balloon || divers || bubbles){bar.querySelectorAll('.toy-tools [data-tool]').forEach(function(button){button.hidden=false;});presetsButton.hidden=false;}
      if(hands){
        bar.querySelectorAll('.toy-tools [data-tool]').forEach(function(button){button.hidden=!/^(poke|build)$/.test(button.dataset.tool);});
        presetsButton.hidden=true;
        document.querySelectorAll('#toy-panel-build [data-build-tool]').forEach(function(button){button.hidden=button.dataset.buildTool!=='punch';button.disabled=!builderState.handsReady || builderState.pending;});
        document.querySelector('#toy-panel-build .toy-build-options').hidden=true;
        document.getElementById('toy-build-share').hidden=true;
        ['undo','redo'].forEach(function(name){document.getElementById('toy-build-'+name).disabled=!builderState.handsReady || builderState.pending;});
        var edit=builderState.wallEdit,world=toy.world(),width=30*8/(world.scaleWidth || world.w);
        handsNote.textContent='Hole punch opens one '+width.toFixed(2)+'-inch cell. Undo needs a clear adjacent exit; old walls, held caps and slime bounds block the move. '+
          (edit && Number.isFinite(edit.workJoules) ? 'Last edit: '+edit.displaced+' parcels, '+(edit.workJoules/1.3558179483314).toFixed(5)+' ft lb of signed parcel work.' : 'Signed parcel work appears here after Undo.')+
          (!builderState.handsReady ? ' Choose a cup, siphon, fountain or native machine.' : ' Existing valves can open here; closing them and other wall drawing use the original scene.');
      }
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
      if(value)releaseHeldControl();
      toy.pause(value);
      sync();
    }
    pauseButton.addEventListener('click', function () { pause(!toy.stats().paused); });
    resumeButton.addEventListener('click', function () { pause(false); document.getElementById('toy-input').focus({ preventScroll: true }); });
    document.getElementById('toy-restart').addEventListener('click', async function () {
      this.disabled=true;
      try {
        if(toy.stats().scene==='siphon')await toy.machine('siphon',{setup:document.getElementById('toy-siphon-setup').value});
        else if(toy.stats().scene==='heron')await toy.machine('heron',{setup:document.getElementById('toy-heron-setup').value});
        else if(nativeScene(toy.stats().scene)){
          releaseHeldControl();var setup=document.getElementById('toy-native-setup').value;
          await toy.machine(toy.stats().scene,nativeSetupOptions(setup));
        }else await toy.scene(toy.stats().scene);
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
      if (event.target.closest('button[data-scene], #toy-clear')) {
        picker.open = false; closePanel(false);
        var sceneButton=event.target.closest('button[data-scene]');
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
      var active = appMode ? document.fullscreenElement === shell : expanded();
      fullButton.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
      fullButton.title = active ? 'Exit fullscreen (Esc)' : 'Fullscreen (F)';
      document.body.classList.toggle('toy-expanded', appMode || active);
      toy.resize();
    }
    // Phones without element fullscreen already see the whole window.
    if (appMode && !(document.fullscreenEnabled && shell.requestFullscreen)) fullButton.hidden = true;
    async function toggleFullscreen() {
      closePanel(false);
      if (appMode) {
        try {
          if (document.fullscreenElement) await document.exitFullscreen();
          else if (!fullButton.hidden) await shell.requestFullscreen();
        } catch (error) {}
        syncFullscreen();
        return;
      }
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
    var initialParameters=new URLSearchParams(location.search),phoneScene=initialParameters.get('scene');
    if(!initialParameters.has('scene') && !initialParameters.has('smoke') && !initialParameters.has('build') && navigator.gpu)phoneScene='self-flushing-cup';
    if(nativeScene(phoneScene) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)){
      shell.classList.add('is-expanded');syncFullscreen();
    }
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('keydown', function (event) {
      if(event.defaultPrevented)return;
      if (event.key === 'Escape') {
        if (openPanel) { event.preventDefault(); closePanel(true); }
        else if (picker.open) { event.preventDefault(); picker.open = false; pickerSummary.focus({ preventScroll: true }); }
        else if (!appMode && shell.classList.contains('is-expanded')) { shell.classList.remove('is-expanded'); syncFullscreen(); fullButton.focus(); }
        return;
      }
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName) || event.target.isContentEditable) return;
      var bounds = shell.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > innerHeight) return;
      if (event.code === 'Space') { event.preventDefault(); pause(!toy.stats().paused); }
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); toggleFullscreen(); }
      if (event.key.toLowerCase() === 'o' && oxygenView && oxygenView.available()) { event.preventDefault(); oxygenView.toggle(); }
    });

    // Observe control changes, including number-key tool selection and presets
    // changed through the console. No additional animation loop is needed.
    var controls = new MutationObserver(sync);
    bar.querySelectorAll('[data-tool], [data-scene], [data-preset]').forEach(function (button) {
      controls.observe(button, { attributes: true, attributeFilter: ['class'] });
    });
    var readout = new MutationObserver(function () {
      var state = toy.stats();
      var label = state.loading ? 'Starting machine' : state.paused ? 'Paused' : state.waterState === 'booting' ? 'Starting water' : 'Live';
      if (status.textContent !== label) sync();
    });
    readout.observe(document.getElementById('toy-readout'), { childList: true });
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { controlsHeight(); toy.resize(); fitPanel(); syncMachineControls(); }).observe(shell);
    if(caveIndicator && typeof ResizeObserver !== 'undefined')new ResizeObserver(function(){toy.resize();syncMachineControls();}).observe(caveIndicator);
    window.addEventListener('resize', fitPanel);
    window.addEventListener('scroll', fitPanel, { passive: true });
    // Reading the existing sample never requests another GPU snapshot.
    var demoActivity = DemoActivity.create(shell);
    demoActivity.onChange(function(active){if(!active){releaseCavePressure();if(submarineControls)submarineControls.release();}});
    demoActivity.setInterval(function () {
      if(document.hidden)return;
      if(shell.classList.contains('is-paused')!==toy.stats().paused)sync();else updateMeasurements();
    }, 200);
    sync();
    toy.resize();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
