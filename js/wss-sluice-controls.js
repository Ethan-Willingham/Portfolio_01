/* The wash station's controls and drawings. Particle motion stays in the solver. */
(function(root){
'use strict';
function text(el,value){if(el.textContent!==value)el.textContent=value;}
function pressed(el,on){el.setAttribute('aria-pressed',String(on));el.classList.toggle('is-on',on);}
function sound(){
 var context=null,noise=null,gain=null,filter=null,buffer=null,enabled=false,previousFed=0;
 function stop(){enabled=false;if(context){context.close().catch(function(){});context=null;}noise=null;gain=null;}
 async function toggle(){
  if(enabled){stop();return false;}
  var Audio=root.AudioContext || root.webkitAudioContext;if(!Audio)return false;
  context=new Audio();buffer=context.createBuffer(1,context.sampleRate,context.sampleRate);
  var samples=buffer.getChannelData(0),seed=81;
  for(var i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=(seed/4294967296-.5)*2;}
  noise=context.createBufferSource();noise.buffer=buffer;noise.loop=true;
  var high=context.createBiquadFilter();high.type='highpass';high.frequency.value=180;
  filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1400;filter.Q.value=.5;
  gain=context.createGain();gain.gain.value=0;noise.connect(high).connect(filter).connect(gain).connect(context.destination);noise.start();
  enabled=true;await context.resume();return true;
 }
 function tick(state,active){
  var delta=state.fed-previousFed;previousFed=state.fed;
  if(!context || !enabled)return;
  var t=context.currentTime,target=active?Math.min(.07,state.runoff*.032+(state.pouring?.012:0)):0;
  gain.gain.setTargetAtTime(target,t,.12);filter.frequency.setTargetAtTime(900+1200*state.runoff,t,.15);
  if(active && delta>0){
   // A short gravel cue accompanies a confirmed transfer through the hopper.
   var grain=context.createBufferSource(),band=context.createBiquadFilter(),tap=context.createGain();grain.buffer=buffer;
   band.type='bandpass';band.frequency.value=2200;band.Q.value=.7;tap.gain.setValueAtTime(Math.min(.055,.014+delta*.002),t);tap.gain.exponentialRampToValueAtTime(.0001,t+.055);
   grain.connect(band).connect(tap).connect(context.destination);grain.start(t,.1);grain.stop(t+.06);grain.onended=function(){grain.disconnect();band.disconnect();tap.disconnect();};
  }
 }
 return {toggle:toggle,tick:tick,stop:stop,enabled:function(){return enabled;}};
}
function draw(c,definition,run,view){
 var d=definition.sluice,s=view.scale,p=view.palette;
 var ink=p.getPropertyValue('--text-dim').trim(),edge=p.getPropertyValue('--rule-strong').trim(),gold=p.getPropertyValue('--toy-grain-gold').trim();
 var panel=p.getPropertyValue('--bg-raised').trim(),accent=p.getPropertyValue('--accent').trim();
 var flowing=(run.valve || view.pouring) && run.waterAdded<d.waterSupply;
 c.save();c.lineWidth=1/s;c.lineJoin='round';c.strokeStyle=edge;c.fillStyle=panel;
 // The faucet's drawn mouth is the real admission point at (120, 64).
 c.beginPath();c.moveTo(78,40);c.lineTo(112,40);c.quadraticCurveTo(132,40,132,60);c.lineTo(132,64);
 c.lineTo(108,64);c.lineTo(108,58);c.quadraticCurveTo(108,54,104,54);c.lineTo(78,54);c.closePath();c.fill();c.stroke();
 c.strokeStyle=flowing?accent:edge;c.lineWidth=3/s;c.beginPath();c.moveTo(97,46);c.lineTo(97,38);
 if(flowing){c.moveTo(87,38);c.lineTo(107,38);}else{c.moveTo(91,32);c.lineTo(103,44);}c.stroke();
 c.lineWidth=1/s;c.font=(11/s)+'px "Commit Mono", monospace';c.fillStyle=ink;
 c.textAlign='center';c.fillText('WASH WATER',116,23);
 // This external hopper is a counted supply. Only released grains enter the world.
 c.fillStyle=panel;c.strokeStyle=run.feeding?accent:edge;
 c.beginPath();c.moveTo(200,96);c.lineTo(232,96);c.lineTo(225,127);c.lineTo(225,137);c.lineTo(207,137);c.lineTo(207,127);c.closePath();c.fill();c.stroke();
 c.save();c.clip();var fraction=(d.hopper-run.fed)/d.hopper;
 c.fillStyle=ink;c.globalAlpha=.4;c.fillRect(200,127-28*fraction,32,28*fraction);
 c.globalAlpha=.85;c.fillStyle=gold;
 for(var i=0;i<Math.ceil(fraction*12);i++){var gx=202+(i*13)%28,gy=102+Math.floor(i/4)*7;c.fillRect(gx,gy,1.6,1.6);}c.restore();
 c.strokeStyle=run.feeding?accent:edge;c.lineWidth=2/s;c.beginPath();c.moveTo(205,run.feeding?133:138);c.lineTo(run.feeding?211:227,run.feeding?129:138);c.stroke();
 c.fillStyle=ink;c.fillText('PAYDIRT',216,85);
 // Bolts and the underside line sit inside the same continuous bed polygon.
 c.lineWidth=1/s;c.strokeStyle=edge;c.beginPath();c.moveTo(80,d.floor(80)+12);c.lineTo(600,d.floor(600)+12);c.stroke();
 for(var x=92;x<608;x+=72){c.beginPath();c.arc(x,d.floor(x)+8,1.8,0,Math.PI*2);c.stroke();}
 c.fillStyle=ink;c.textAlign='left';c.fillText(d.slope.toFixed(1)+' degrees',90,d.floor(90)+42);
 c.textAlign='center';c.fillText(d.riffles?'RIFFLE BED':'PLAIN BED',408,d.floor(408)+46);
 c.fillText('TAILINGS',588,355);
 c.font=(10/s)+'px "Commit Mono", monospace';c.fillText('Water + washed grains',588,369);
 c.restore();
}
function create(toy,shell){
 if(!toy.sluice)return null;
 var box=document.createElement('section');box.className='sluice-console';box.hidden=true;box.setAttribute('aria-label','Gold sluice controls');
 box.innerHTML=`
  <div class="sluice-readings">
   <div class="sluice-stat sluice-gold"><span>Gold remaining</span><b id="sluice-gold">0 / 0</b><span class="sluice-meter"><i id="sluice-gold-bar"></i></span></div>
   <div class="sluice-stat"><span>Sand washed</span><b id="sluice-sand">0 / 0</b><span class="sluice-meter"><i id="sluice-sand-bar"></i></span></div>
   <div class="sluice-stat sluice-loss"><span>Gold in tailings</span><b id="sluice-lost">0</b></div>
   <p id="sluice-guidance" role="status">Open the water. Feed a little. Watch the bed.</p>
  </div>
  <div class="sluice-console-main">
   <div class="sluice-water-controls">
    <button id="sluice-water" type="button" aria-pressed="false" title="Toggle wash water (W)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2C8 5 4.5 8.5 4.5 12a5.5 5.5 0 0 0 11 0C15.5 8.5 12 5 10 2Z"/></svg><span><b id="sluice-valve-label">Water off</b><small id="sluice-water-left">Tank 100%</small></span></button>
    <label class="sluice-flow-label" for="sluice-flow"><span>Flow <output id="sluice-flow-value">100%</output></span><input id="sluice-flow" type="range" min="25" max="150" step="5" value="100" aria-label="Water flow"/></label>
   </div>
   <div class="sluice-feed-controls">
    <button id="sluice-feed" type="button" aria-pressed="false" title="Hold to feed paydirt (G)"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h14l-5 8v4H8v-4Z M8 18h.01M12 18h.01"/></svg><span>Hold to feed</span></button>
    <span class="sluice-supply"><b id="sluice-hopper">240</b> grains in hopper<span class="sluice-meter"><i id="sluice-hopper-bar"></i></span></span>
   </div>
   <div class="sluice-view-controls">
    <button id="sluice-sound" type="button" aria-pressed="false" title="Turn wash and gravel sound on">Sound</button>
    <button id="sluice-slow" type="button" aria-pressed="false" title="Quarter speed (S)">Slow</button>
    <button id="sluice-inspect" type="button" aria-pressed="false" title="Inspect grains (I)">Inspect</button>
    <button id="sluice-setup" type="button" aria-expanded="false" aria-controls="sluice-workbench">Set up</button>
   </div>
  </div>`;
 shell.appendChild(box);
 var bench=document.createElement('section');bench.id='sluice-workbench';bench.className='sluice-workbench';bench.hidden=true;bench.setAttribute('aria-label','Set up the next sluice run');
 bench.innerHTML=`<div class="sluice-workbench-head"><h2>Build the next run</h2><button id="sluice-close" type="button" aria-label="Close sluice setup">Close</button></div>
  <p>Set the bed, then start fresh. Flow stays adjustable during the run.</p>
  <label for="sluice-slope">Bed angle <output id="sluice-slope-value">8.5 degrees</output></label>
  <input id="sluice-slope" type="range" min="4" max="11" step="0.5" value="8.5"/>
  <label for="sluice-riffle">Riffle height <output id="sluice-riffle-value">0.25 in</output></label>
  <input id="sluice-riffle" type="range" min="0" max="12" step="1" value="6"/>
  <p class="sluice-range-note">Flat at 0. Taller bars make deeper pockets.</p>
  <label for="sluice-materials">Material comparison</label><select id="sluice-materials"><option value="ordinary">Sand and gold</option><option value="matched">Equal densities</option></select>
  <label class="sluice-check"><input id="sluice-charge" type="checkbox" checked/>Start with a sample on the bed</label>
  <p id="sluice-previous" hidden></p>
  <div class="sluice-run-actions"><button id="sluice-defaults" type="button">Defaults</button><button id="sluice-run" type="button">New run</button></div>
  <p class="sluice-shortcuts">W water · hold G to feed · S slow · I inspect<br/>Space pauses. The same grain mix returns each run.</p>`;
 shell.appendChild(bench);
 var inspect=document.createElement('div');inspect.className='sluice-inspector';inspect.hidden=true;
 inspect.innerHTML='<button type="button" id="sluice-prev" aria-label="Inspect previous pocket">Previous</button><span id="sluice-pocket">Pocket 1 of 6</span><button type="button" id="sluice-next" aria-label="Inspect next pocket">Next</button><button type="button" id="sluice-fit">Whole bed</button>';
 shell.appendChild(inspect);
 var pan=document.createElement('div');pan.className='sluice-pan';pan.hidden=true;pan.setAttribute('aria-hidden','true');document.getElementById('toy-viewport').appendChild(pan);
 function el(id){return document.getElementById('sluice-'+id);}
 var water=el('water'),flow=el('flow'),feed=el('feed'),slow=el('slow'),zoom=el('inspect'),setup=el('setup');
 var audio=sound();
 var state=null,active=false,lastRun=null,lastData=null,pocket=0,inspectOn=false,drag=null,feedingPointer=null,feedingKey=null;
 var pendingSlope=null,pendingHeight=6,lastHeight=0,previous=null,previousSpeed=1;
 function setBench(on){bench.hidden=!on;setup.setAttribute('aria-expanded',String(on));if(on){releaseFeed();el('slope').focus({preventScroll:true});}else setup.focus({preventScroll:true});}
 function releaseFeed(){
  var id=feedingPointer;feedingPointer=null;feedingKey=null;
  toy.sluiceControl('feed',false);pressed(feed,false);
  if(id!==null && feed.hasPointerCapture(id))feed.releasePointerCapture(id);
 }
 function feedStart(){if(!active || !state || !state.hopper || toy.stats().loading)return;toy.pause(false);toy.sluiceControl('feed',true);pressed(feed,true);}
 function stopInputs(){releaseFeed();toy.sluiceControl('valve',false);update();}
 function toggleWater(){if(!active)return;var d=toy.sluice();if(!d)return;if(!d.valve)toy.pause(false);toy.sluiceControl('valve',!d.valve);update();}
 function toggleSlow(){if(!active)return;toy.set('time',toy.stats().timeScale<.5?1:.25);update();}
 function inspectPocket(){
  if(!active)return;
  var d=toy.machineState().definition.sluice,x=268+pocket*64,y=d.floor(x)-7;
  toy.setCamera({zoom:2.8,panX:0,panY:0});var cam=toy.camera();
  toy.setCamera({panX:(360-x)*cam.scale,panY:(200-y)*cam.scale});
  text(el('pocket'),(d.riffles?'Pocket ':'Section ')+(pocket+1)+' of 6');
 }
 function setInspect(on){inspectOn=on;inspect.hidden=!on;pan.hidden=!on;pressed(zoom,on);drag=null;
  if(on)inspectPocket();else toy.setCamera({zoom:1,panX:0,panY:0});
 }
 water.addEventListener('click',toggleWater);
 flow.addEventListener('input',function(){toy.sluiceControl('flow',+flow.value);update();});
 feed.addEventListener('pointerdown',function(e){if(e.button!==0 || feedingPointer!==null)return;e.preventDefault();feedingPointer=e.pointerId;feed.setPointerCapture(e.pointerId);feedStart();});
 ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){feed.addEventListener(name,function(e){if(feedingPointer===e.pointerId)releaseFeed();});});
 feed.addEventListener('keydown',function(e){if(![' ','Enter'].includes(e.key))return;e.preventDefault();if(!e.repeat){feedingKey=e.key;feedStart();}});
 feed.addEventListener('keyup',function(e){if(feedingKey===e.key){e.preventDefault();releaseFeed();}});
 feed.addEventListener('blur',releaseFeed);
 slow.addEventListener('click',toggleSlow);zoom.addEventListener('click',function(){setInspect(!inspectOn);});
 el('sound').addEventListener('click',async function(){
  this.disabled=true;try{await audio.toggle();pressed(this,audio.enabled());this.title=audio.enabled()?'Mute wash and gravel sound':'Turn wash and gravel sound on';}
  catch(error){audio.stop();text(el('guidance'),'Sound is unavailable in this browser.');}finally{this.disabled=false;}
 });
 setup.addEventListener('click',function(){
  if(bench.hidden)shell.querySelectorAll('.toy-panel:not([hidden]) [data-close]').forEach(function(button){button.click();});
  setBench(bench.hidden);
 });el('close').addEventListener('click',function(){setBench(false);});
 shell.addEventListener('click',function(e){if(e.target.closest('[data-panel]')){bench.hidden=true;setup.setAttribute('aria-expanded','false');}});
 el('fit').addEventListener('click',function(){setInspect(false);});
 el('prev').addEventListener('click',function(){pocket=(pocket+5)%6;inspectPocket();});
 el('next').addEventListener('click',function(){pocket=(pocket+1)%6;inspectPocket();});
 el('slope').addEventListener('input',function(){pendingSlope=+this.value;text(el('slope-value'),pendingSlope.toFixed(1)+' degrees');});
 el('riffle').addEventListener('input',function(){pendingHeight=+this.value;var label=(pendingHeight/24).toFixed(2)+' in';text(el('riffle-value'),label);this.setAttribute('aria-valuetext',label);});
 el('defaults').addEventListener('click',function(){pendingSlope=Math.atan(80/536)*180/Math.PI;pendingHeight=6;el('slope').value=pendingSlope;el('riffle').value=6;el('materials').value='ordinary';el('charge').checked=true;text(el('slope-value'),'8.5 degrees');text(el('riffle-value'),'0.25 in');});
 el('run').addEventListener('click',async function(){
  if(!active || toy.stats().loading)return;
  var before=toy.sluice(),seed=toy.machineState().seed;this.disabled=true;stopInputs();
  try{
   await toy.machine('gold-sluice-box',{slope:pendingSlope,riffleHeight:pendingHeight,matched:el('materials').value==='matched',initialCharge:el('charge').checked,seed:seed});
   previous=before;setInspect(false);setBench(false);toy.pause(false);update();
  }catch(error){text(el('guidance'),error.message);}finally{this.disabled=false;}
 });
 pan.addEventListener('pointerdown',function(e){if(e.button!==0)return;e.preventDefault();var c=toy.camera();drag={id:e.pointerId,x:e.clientX,y:e.clientY,panX:c.panX,panY:c.panY};pan.setPointerCapture(e.pointerId);});
 pan.addEventListener('pointermove',function(e){if(!drag || drag.id!==e.pointerId)return;toy.setCamera({panX:drag.panX+e.clientX-drag.x,panY:drag.panY+e.clientY-drag.y});});
 ['pointerup','pointercancel','lostpointercapture'].forEach(function(name){pan.addEventListener(name,function(){drag=null;});});
 window.addEventListener('blur',stopInputs);document.addEventListener('visibilitychange',function(){if(document.hidden)stopInputs();});
 window.addEventListener('pagehide',audio.stop);
 window.addEventListener('keydown',function(e){
  if(!active || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey)return;
  if(e.key==='Escape' && (!bench.hidden || inspectOn)){e.preventDefault();if(!bench.hidden)setBench(false);else setInspect(false);return;}
  if(/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(e.target.tagName) || e.target.isContentEditable || !bench.hidden)return;
  var k=e.key.toLowerCase();
  if(['w','g','s','i'].indexOf(k)<0)return;e.preventDefault();if(e.repeat)return;
  if(k==='w')toggleWater();else if(k==='s')toggleSlow();else if(k==='i')setInspect(!inspectOn);else{feedingKey='g';feedStart();}
 });
 window.addEventListener('keyup',function(e){if(e.key.toLowerCase()==='g' && feedingKey==='g')releaseFeed();});
 function update(){
  var current=toy.machineState(),stats=toy.stats(),live=!!(current && current.definition.sluice && stats.scene==='gold-sluice-box');
  if(live!==active){
   active=live;box.hidden=!live;shell.classList.toggle('has-sluice-console',live);
   if(live)previousSpeed=stats.timeScale;
   if(!live){audio.stop();pressed(el('sound'),false);bench.hidden=true;inspect.hidden=true;pan.hidden=true;inspectOn=false;drag=null;lastRun=null;lastData=null;feedingPointer=null;feedingKey=null;toy.setCamera({zoom:1,panX:0,panY:0});toy.set('time',previousSpeed);}
   toy.resize();
  }
  if(!live)return;
  state=toy.sluice();if(!state)return;
  if(current!==lastRun){
   if(lastData)previous=lastData;lastRun=current;
   var d=current.definition.sluice;pendingSlope=d.slope;pendingHeight=d.riffles?d.riffleHeight:0;
   el('slope').value=pendingSlope;el('riffle').value=pendingHeight;el('materials').value=d.matched?'matched':'ordinary';el('charge').checked=d.initialCharge;
   text(el('slope-value'),pendingSlope.toFixed(1)+' degrees');text(el('riffle-value'),(pendingHeight/24).toFixed(2)+' in');el('riffle').setAttribute('aria-valuetext',(pendingHeight/24).toFixed(2)+' inches');
   if(inspectOn)inspectPocket();
  }
  lastData=state;
  audio.tick(state,!stats.paused && !document.hidden && !stats.loading);
  shell.classList.toggle('sluice-start-hints',!state.fed && !state.admitted && state.clock<6);
  text(el('gold'),(state.gold.total-state.gold.washed)+' / '+state.gold.total);text(el('sand'),state.sand.washed+' / '+state.sand.total);text(el('lost'),String(state.gold.washed));
  el('gold-bar').style.width=(state.gold.total?100*(1-state.gold.washed/state.gold.total):0)+'%';
  el('sand-bar').style.width=(state.sand.total?100*state.sand.washed/state.sand.total:0)+'%';
  el('hopper-bar').style.width=100*state.hopper/state.hopperCapacity+'%';text(el('hopper'),String(state.hopper));
  text(el('valve-label'),state.waterRemaining===0?'Tank empty':state.valve?'Water on':'Water off');pressed(water,state.valve);water.disabled=!current.ready || stats.loading || !state.waterRemaining;
  feed.disabled=!current.ready || stats.loading || !state.hopper;pressed(feed,state.feeding);
  flow.disabled=!current.ready || stats.loading;flow.value=state.flow;text(el('flow-value'),state.flow+'%');text(el('water-left'),'Tank '+Math.ceil(100*state.waterRemaining/state.waterSupply)+'%');
  pressed(slow,stats.timeScale<.5);text(slow,stats.timeScale<.5?'Speed 1/4':'Slow');
  var guidance=stats.loading?'Filling the station.':stats.paused?'Paused. Space resumes.':state.waterRemaining===0?'Water tank empty. Let it settle, or start a new run.':
   !state.hopper?'Hopper empty. Wash the bed, then close the water.':state.feeding?'Feeding paydirt. Release to stop.':state.gold.washed?'Gold reached the tailings. Try a gentler flow.':state.valve?'Water running. Hold Feed for a small charge.':'Open the water. Feed a little. Watch the bed.';
  text(el('guidance'),guidance);
  el('previous').hidden=!previous;
  if(previous)text(el('previous'),'Previous run: '+(previous.gold.total-previous.gold.washed)+'/'+previous.gold.total+' gold remained; '+previous.sand.washed+'/'+previous.sand.total+' sand washed out.');
  var height=box.getBoundingClientRect().height;if(height!==lastHeight){lastHeight=height;shell.style.setProperty('--sluice-console-height',height+'px');toy.resize();}
 }
 return {update:update};
}
root.WSSSluiceControls={create:create,draw:draw};
})(window);
