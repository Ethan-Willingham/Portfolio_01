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
 var d=definition.sluice,s=view.scale,p=view.palette,compact=s<.65;
 var ink=p.getPropertyValue('--text-dim').trim(),edge=p.getPropertyValue('--rule-strong').trim(),gold=p.getPropertyValue('--toy-grain-gold').trim();
 var panel=p.getPropertyValue('--bg-raised').trim(),accent=p.getPropertyValue('--accent').trim(),black=p.getPropertyValue('--line-mid').trim();
 var flowing=(run.valve || view.pouring) && run.waterAdded<d.waterSupply;
 c.save();c.lineWidth=1/s;c.lineJoin='round';c.strokeStyle=edge;c.fillStyle=panel;
 // The faucet's drawn mouth is the real admission point at (120, 64).
 c.beginPath();c.moveTo(78,40);c.lineTo(112,40);c.quadraticCurveTo(132,40,132,60);c.lineTo(132,64);
 c.lineTo(108,64);c.lineTo(108,58);c.quadraticCurveTo(108,54,104,54);c.lineTo(78,54);c.closePath();c.fill();c.stroke();
 c.strokeStyle=flowing?accent:edge;c.lineWidth=3/s;c.beginPath();c.moveTo(97,46);c.lineTo(97,38);
 if(flowing){c.moveTo(87,38);c.lineTo(107,38);}else{c.moveTo(91,32);c.lineTo(103,44);}c.stroke();
 c.lineWidth=1/s;c.font=(11/s)+'px "Commit Mono", monospace';c.fillStyle=ink;
 c.textAlign='center';if(!compact)c.fillText('WASH WATER',116,23);
 // This external hopper is a counted supply. Only released grains enter the world.
 c.fillStyle=panel;c.strokeStyle=run.feeding?accent:edge;
 var fx=d.feed.x;c.beginPath();c.moveTo(fx-28,80);c.lineTo(fx+28,80);c.lineTo(fx+9,127);c.lineTo(fx+9,137);c.lineTo(fx-9,137);c.lineTo(fx-9,127);c.closePath();c.fill();c.stroke();
 c.save();c.clip();var fraction=(d.hopper-run.fed)/d.hopper;
 c.fillStyle=ink;c.globalAlpha=.18;c.fillRect(fx-28,127-44*fraction,56,44*fraction);
 c.globalAlpha=.9;
 var remaining=d.hopper-run.fed,dots=Math.ceil(fraction*80);
 for(var i=0;i<dots;i++){var material=d.feedMaterials[Math.min(d.hopper-1,run.fed+Math.floor(i*remaining/Math.max(1,dots)))];
  c.fillStyle=material==='gold'?gold:material==='black-sand'?black:ink;
  var gx=fx-26+(i*17)%52,gy=86+Math.floor(i/10)*5;c.fillRect(gx,gy,1.6,1.6);
 }c.restore();
 c.strokeStyle=run.feeding?accent:edge;c.lineWidth=2/s;c.beginPath();c.moveTo(fx-11,run.feeding?133:138);c.lineTo(run.feeding?fx-5:fx+11,run.feeding?129:138);c.stroke();
 c.fillStyle=ink;if(!compact)c.fillText('CLASSIFIED PAYDIRT',fx+28,68);
 // Bolts and the underside line sit inside the same continuous bed polygon.
 c.lineWidth=1/s;c.strokeStyle=edge;c.beginPath();c.moveTo(80,d.floor(80)+6);c.lineTo(d.tailingsX-8,d.floor(d.tailingsX-8)+6);c.stroke();
 for(var x=92;x<d.tailingsX;x+=96){c.beginPath();c.arc(x,d.floor(x)+4,1.4,0,Math.PI*2);c.stroke();}
 c.save();c.translate(72,176);c.rotate(d.slope*Math.PI/180);c.strokeStyle=edge;c.beginPath();c.moveTo(0,34);c.lineTo(d.lengthInches*d.pixelsPerInch,34);
 for(var inch=0;inch<=d.lengthInches;inch+=3){var ux=inch*d.pixelsPerInch;c.moveTo(ux,34-3/s);c.lineTo(ux,34+(inch%12===0?5:3)/s);}c.stroke();
 var rulerStep=compact && d.lengthInches>36?24:12,rulerY=34+18/s;
 c.fillStyle=ink;c.textAlign='center';for(inch=0;inch<d.lengthInches-6;inch+=rulerStep)c.fillText(inch+' in',inch*d.pixelsPerInch,rulerY);c.fillText(d.lengthInches+' in',d.lengthInches*d.pixelsPerInch,rulerY);c.restore();
 c.fillStyle=ink;c.textAlign='left';c.font=(10/s)+'px "Commit Mono", monospace';
 if(!compact)c.fillText(d.lengthInches+' in long / 10 in wide / 4.5 in sides / '+d.slope.toFixed(1)+' degrees',400,22);
 var mid=(72+d.tailingsX)/2;c.textAlign='center';
 if(compact){}
 else{c.fillText(run.cleanup?'RIFFLES LIFTED':d.riffles?'RIFFLE BED':'PLAIN BED',mid,d.floor(mid)+90);
  var legendY=d.floor(mid)+112;c.fillStyle=ink;c.fillText('Quartz',mid-120,legendY);c.fillText('Black sand',mid,legendY);c.fillStyle=gold;c.fillText('Sparse gold',mid+130,legendY);}
 c.font=((compact?7:10)/s)+'px "Commit Mono", monospace';
 c.fillStyle=run.cleanup?gold:ink;c.fillText(compact?'PAN':'CONCENTRATE',d.collection.x+d.collection.width/2,580-8/s);
 c.fillStyle=ink;c.fillText('TAILINGS',d.tailings.x+d.tailings.width/2,580-8/s);
 if(view.gold && view.gold.length){
  c.strokeStyle=gold;c.fillStyle=gold;c.lineWidth=1/s;
  view.gold.forEach(function(point){c.beginPath();c.arc(point.x,point.y,5/s,0,Math.PI*2);c.stroke();});
 }
 c.restore();
}
function create(toy,shell){
 if(!toy.sluice)return null;
 var box=document.createElement('section');box.className='sluice-console';box.hidden=true;box.setAttribute('aria-label','Gold sluice controls');
 box.innerHTML=`
  <div class="sluice-console-head"><div class="sluice-live-result"><b id="sluice-phase">Wash the paydirt</b><span id="sluice-summary">A sample is waiting in the box.</span></div>
   <div class="sluice-view-controls"><button id="sluice-mark" type="button" aria-pressed="true">Show gold</button><button id="sluice-inspect" type="button" aria-pressed="false">Inspect</button><button id="sluice-water" type="button" title="Close both valves">Stop</button><button id="sluice-setup" type="button" aria-expanded="false" aria-controls="sluice-workbench">Contents / setup</button></div>
  </div>
  <div class="sluice-console-main">
   <div class="sluice-operation"><label class="sluice-flow-label" for="sluice-flow"><span><b>1. Water valve</b><output id="sluice-flow-value">Off</output></span><input id="sluice-flow" type="range" min="0" max="150" step="5" value="0" aria-label="Water flow"/><span class="sluice-scale"><span>Off</span><span>Gentle</span><span>Strong</span></span></label><div class="sluice-hopper-bottom"><small id="sluice-water-left">Tank 100%</small><button id="sluice-refill" type="button">Refill tank</button></div></div>
   <div class="sluice-operation"><label class="sluice-flow-label" for="sluice-feed-rate"><span><b>2. Paydirt hopper</b><output id="sluice-feed-value">Closed</output></span><input id="sluice-feed-rate" type="range" min="0" max="240" step="20" value="0" aria-label="Paydirt feed rate"/><span class="sluice-scale"><span>Closed</span><span>Slow</span><span>Fast</span></span></label><div class="sluice-hopper-bottom"><small id="sluice-hopper">2,400 grains left</small><button id="sluice-scoop" type="button" title="Release 120 grains (G)">One scoop</button></div></div>
   <div class="sluice-operation sluice-cleanup-controls"><b>3. Rinse and collect</b><div><button id="sluice-rinse" type="button">Rinse bed</button><button id="sluice-cleanup" type="button">Lift riffles</button></div><small id="sluice-cleanup-note">Lift the riffles, then rinse into the pan.</small></div>
  </div>
  <div class="sluice-console-foot"><p id="sluice-guidance" role="status">Slide the water valve open. A sample is already on the bed.</p></div>`;
 shell.appendChild(box);
 var bench=document.createElement('section');bench.id='sluice-workbench';bench.className='sluice-workbench';bench.hidden=true;bench.setAttribute('aria-label','Set up the next sluice run');
 bench.innerHTML=`<div class="sluice-workbench-head"><h2>Contents and setup</h2><button id="sluice-close" type="button" aria-label="Close sluice setup">Close</button></div>
  <p id="sluice-contents-note">Counts follow the actual grains. In box includes grains traveling along the bed; only pan contents can be picked up.</p>
  <div class="sluice-table-scroll"><table class="sluice-contents"><thead><tr><th>Grains</th><th>Input</th><th>In box</th><th>Travel</th><th>Pan</th><th>Saved</th><th>Tailings</th><th>Spill</th></tr></thead><tbody id="sluice-contents"></tbody></table></div>
  <p id="sluice-saved">No concentrate saved yet.</p><button id="sluice-empty-tailings" type="button">Empty tailings bin</button>
  <p>The pan holds mixed concentrate: gold, black sand and any quartz still in the bed. Panning that concentrate is a separate step.</p>
  <div class="sluice-run-actions"><button id="sluice-sound" type="button" aria-pressed="false">Sound</button><button id="sluice-slow" type="button" aria-pressed="false">Slow</button></div>
  <p>Real hand-sluice dimensions. This view cuts along the bed; its 10-inch width extends out of the page.</p>
  <label for="sluice-length">Box length</label><select id="sluice-length"><option value="51">51 inches, Keene A52</option><option value="36">36 inches, Keene A51</option></select>
  <label for="sluice-slope">Bed angle <output id="sluice-slope-value">8.5 degrees</output></label>
  <input id="sluice-slope" type="range" min="4" max="11" step="0.5" value="8.5"/>
  <label for="sluice-riffle">Riffle height <output id="sluice-riffle-value">0.25 in</output></label>
  <input id="sluice-riffle" type="range" min="0" max="12" step="1" value="6"/>
  <p class="sluice-range-note">Flat at 0. Taller bars make deeper pockets.</p>
  <p>Practice batch: 2,202 quartz grains, 192 heavy black-sand grains, and 6 gold grains. Screened to roughly 1.5 mm. Gold is enriched for visibility.</p>
  <label for="sluice-materials">Material comparison</label><select id="sluice-materials"><option value="ordinary">Quartz, black sand and gold</option><option value="matched">Equal mineral densities</option></select>
  <label class="sluice-check"><input id="sluice-charge" type="checkbox" checked/>Start with a sample on the bed</label>
  <p id="sluice-previous" hidden></p>
  <div class="sluice-run-actions"><button id="sluice-defaults" type="button">Defaults</button><button id="sluice-run" type="button">New run</button></div>
  <p class="sluice-shortcuts">W water · G one scoop · S slow · I inspect<br/>Space pauses. The same grain mix returns each run. <a id="sluice-dimensions-source" href="https://www.keene.store/?Product_Code=A52&amp;Screen=PROD" target="_blank" rel="noopener">Dimensions source</a></p>`;
 shell.appendChild(bench);
 var inspect=document.createElement('div');inspect.className='sluice-inspector';inspect.hidden=true;
 inspect.innerHTML='<button type="button" id="sluice-prev" aria-label="Inspect previous pocket">Previous</button><span id="sluice-pocket">Pocket 1 of 6</span><button type="button" id="sluice-next" aria-label="Inspect next pocket">Next</button><button type="button" id="sluice-fit">Whole bed</button>';
 shell.appendChild(inspect);
 var pan=document.createElement('div');pan.className='sluice-pan';pan.hidden=true;pan.setAttribute('aria-hidden','true');document.getElementById('toy-viewport').appendChild(pan);
 function el(id){return document.getElementById('sluice-'+id);}
 var water=el('water'),flow=el('flow'),feed=el('feed-rate'),slow=el('slow'),zoom=el('inspect'),setup=el('setup');
 var audio=sound();
 var state=null,active=false,lastRun=null,lastData=null,pocket=0,inspectOn=false,drag=null,feedingPointer=null,feedingKey=null;
 var pendingSlope=null,pendingHeight=6,lastHeight=0,previous=null,previousSpeed=1;
 function setBench(on){bench.hidden=!on;setup.setAttribute('aria-expanded',String(on));if(on){releaseFeed();el('close').focus({preventScroll:true});}else setup.focus({preventScroll:true});}
 function releaseFeed(){toy.sluiceControl('feed',false);}
 function stopInputs(){releaseFeed();toy.sluiceControl('valve',false);update();}
 function toggleWater(){if(!active)return;var d=toy.sluice();if(!d)return;if(!d.valve)toy.pause(false);toy.sluiceControl('valve',!d.valve);update();}
 function scoop(){if(!active || !state || !state.hopper || state.cleanup || toy.stats().loading)return;toy.pause(false);toy.sluiceControl('scoop',120);update();}
 function toggleSlow(){if(!active)return;toy.set('time',toy.stats().timeScale<.5?1:.25);update();}
 function inspectPocket(){
  if(!active)return;
  var d=toy.machineState().definition.sluice;pocket%=d.sections.length;var section=d.sections[pocket],x=section.x,y=section.y;
  toy.setCamera({zoom:2.8,panX:0,panY:0});var cam=toy.camera();
  var world=toy.world();toy.setCamera({panX:(world.w*.5-x)*cam.scale,panY:(world.h*.5-y)*cam.scale});
  text(el('pocket'),(d.riffles?'Pocket ':'Section ')+(pocket+1)+' of '+d.sections.length);
 }
 function setInspect(on){inspectOn=on;inspect.hidden=!on;pan.hidden=!on;pressed(zoom,on);drag=null;
  if(on)inspectPocket();else toy.setCamera({zoom:1,panX:0,panY:0});
 }
 water.addEventListener('click',stopInputs);
 flow.addEventListener('input',function(){if(+flow.value>0)toy.pause(false);toy.sluiceControl('flow',+flow.value);update();});
 feed.addEventListener('input',function(){if(+feed.value>0)toy.pause(false);toy.sluiceControl('feedRate',+feed.value);update();});
 el('scoop').addEventListener('click',scoop);
 el('rinse').addEventListener('click',function(){releaseFeed();toy.pause(false);toy.sluiceControl('flow',100);update();});
 el('cleanup').addEventListener('click',async function(){
  stopInputs();
  try{if(toy.sluice().cleanup)await toy.sluiceTransfer('collect');else toy.sluiceControl('cleanup',true);setInspect(false);update();}
  catch(error){text(el('guidance'),error.message);}
 });
 el('empty-tailings').addEventListener('click',async function(){try{stopInputs();await toy.sluiceTransfer('tailings');update();}catch(error){text(el('guidance'),error.message);}});
 el('refill').addEventListener('click',function(){if(!toy.sluiceControl('refill',true)){setBench(true);text(el('guidance'),'Empty the receivers to make room for more water.');}update();});
 el('mark').addEventListener('click',function(){toy.sluiceControl('showGold',!toy.sluice().showGold);update();});
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
 el('prev').addEventListener('click',function(){var n=toy.machineState().definition.sluice.sections.length;pocket=(pocket+n-1)%n;inspectPocket();});
 el('next').addEventListener('click',function(){pocket++;inspectPocket();});
 el('slope').addEventListener('input',function(){pendingSlope=+this.value;text(el('slope-value'),pendingSlope.toFixed(1)+' degrees');});
 el('riffle').addEventListener('input',function(){pendingHeight=+this.value;var label=(pendingHeight/24).toFixed(2)+' in';text(el('riffle-value'),label);this.setAttribute('aria-valuetext',label);});
 el('defaults').addEventListener('click',function(){pendingSlope=8.5;pendingHeight=6;el('length').value='51';el('slope').value=8.5;el('riffle').value=6;el('materials').value='ordinary';el('charge').checked=true;text(el('slope-value'),'8.5 degrees');text(el('riffle-value'),'0.25 in');});
 el('run').addEventListener('click',async function(){
  if(!active || toy.stats().loading)return;
  var before=toy.sluice(),seed=toy.machineState().seed;this.disabled=true;stopInputs();
  try{
   await toy.machine('gold-sluice-box',{lengthInches:+el('length').value,slope:pendingSlope,riffleHeight:pendingHeight,matched:el('materials').value==='matched',initialCharge:el('charge').checked,seed:seed});
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
  if(k==='w')toggleWater();else if(k==='s')toggleSlow();else if(k==='i')setInspect(!inspectOn);else scoop();
 });

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
   el('length').value=d.lengthInches;el('slope').value=pendingSlope;el('riffle').value=pendingHeight;el('materials').value=d.matched?'matched':'ordinary';el('charge').checked=d.initialCharge;
   el('dimensions-source').href=current.definition.source.url;
   text(el('slope-value'),pendingSlope.toFixed(1)+' degrees');text(el('riffle-value'),(pendingHeight/24).toFixed(2)+' in');el('riffle').setAttribute('aria-valuetext',(pendingHeight/24).toFixed(2)+' inches');
   if(inspectOn)inspectPocket();
  }
  lastData=state;
  audio.tick(state,!stats.paused && !document.hidden && !stats.loading);
  shell.classList.toggle('sluice-start-hints',!state.fed && !state.admitted && state.clock<6);
  var ready=current.ready && !stats.loading && !state.transferring;
  text(el('phase'),state.cleanup?'Collect the concentrate':'Wash the paydirt');
  text(el('summary'),'Gold: '+state.gold.bed+' box / '+(state.gold.collected-state.secured.gold)+' pan / '+state.secured.gold+' saved / '+state.gold.washed+' tailings'+(state.gold.moving?' / '+state.gold.moving+' traveling':'')+(state.gold.spilled?' / '+state.gold.spilled+' spilled':''));
  text(el('hopper'),state.hopper.toLocaleString()+' grains left');
  feed.disabled=!ready || !state.hopper || state.cleanup;feed.value=state.feedRate;
  text(el('feed-value'),state.scoopRemaining?'Scoop: '+state.scoopRemaining:state.feeding?state.feedRate+' grains/s':'Closed');
  el('scoop').disabled=feed.disabled || state.scoopRemaining>0;
  flow.disabled=!ready || !state.waterRemaining;flow.value=state.valve?state.flow:0;
  var flowLabel=!state.valve?'Off':state.flow<=40?'Trickle':state.flow<=75?'Gentle':state.flow<=110?'Steady':'Strong';
  text(el('flow-value'),flowLabel+(state.valve?' '+state.flow+'%':''));flow.setAttribute('aria-valuetext',flowLabel);
  text(el('water-left'),'Tank '+Math.ceil(100*state.waterRemaining/36000)+'%');el('refill').disabled=!ready || state.waterRemaining>=36000;
  el('cleanup').disabled=!ready;el('rinse').disabled=!ready || !state.waterRemaining;
  text(el('cleanup'),state.cleanup?'Pick up pan':'Lift riffles');text(el('rinse'),state.cleanup?'Rinse into pan':'Rinse bed');
  text(el('cleanup-note'),state.cleanup?'Pick up the wet pan to save its actual contents.':'Lift the riffles, then rinse into the pan.');
  pressed(el('mark'),state.showGold);pressed(slow,stats.timeScale<.5);text(slow,stats.timeScale<.5?'Speed 1/4':'Slow');
  var inBox=state.sand.bed+state.blackSand.bed+state.gold.bed,moving=state.sand.moving+state.blackSand.moving+state.gold.moving;
  var collected=state.sand.collected+state.blackSand.collected+state.gold.collected;
  var guidance=state.transferring?'Lifting the wet contents into storage.':stats.loading?'Filling the station.':stats.paused?'Paused. Space resumes.':
   state.cleanup?(state.valve?inBox+' grains in the box. Pick up the pan before it overflows.':state.waterRemaining?'Open Rinse into pan. Gold and remaining sediment wash out together.':'Refill the tank to keep rinsing. '+inBox+' grains are still in the box.'):
   !state.waterRemaining?'Refill the tank to continue. Pick up concentrate before the pan overflows.':
   state.feeding && !state.valve?'The hopper is open with the water off. Material will pile up.':
   state.feeding?'Feeding '+state.feedRate+' grains/s. Close the hopper to wash this charge through.':
   state.valve?state.gold.washed?'Gold reached the tailings. Reduce the water flow.':state.sand.washed+' quartz grains reached the tailings. Watch the marked gold.':
   'Open the water valve. Pale quartz should travel farther than the marked gold.';
  text(el('guidance'),guidance);
  var html=[['Quartz',state.sand],['Black sand',state.blackSand],['Gold',state.gold]].map(function(row){var r=row[1];var key=row[0]==='Quartz'?'sand':row[0]==='Gold'?'gold':'blackSand';return '<tr><th>'+row[0]+'</th>'+[r.total,r.bed,r.moving,r.collected-state.secured[key],state.secured[key],r.washed,r.spilled].map(function(v){return '<td>'+v+'</td>';}).join('')+'</tr>';}).join('');
  text(el('saved'),'Saved concentrate: '+state.secured.gold+' gold, '+state.secured.blackSand+' black sand, '+state.secured.sand+' quartz. Water stays with the wet concentrate. Tailings counts include emptied bins.');el('empty-tailings').disabled=!ready;
  if(el('contents').innerHTML!==html)el('contents').innerHTML=html;
  el('previous').hidden=!previous;
  if(previous)text(el('previous'),'Previous run: '+previous.gold.collected+' gold in the concentrate pan; '+previous.gold.washed+' in tailings. New run restores the practice batch and water tank.');
  var height=box.getBoundingClientRect().height;if(height!==lastHeight){lastHeight=height;shell.style.setProperty('--sluice-console-height',height+'px');toy.resize();}
 }
 return {update:update};
}
root.WSSSluiceControls={create:create,draw:draw};
})(window);
