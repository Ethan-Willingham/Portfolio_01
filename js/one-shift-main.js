(function(root){
 'use strict';const O=root.OneShift,canvas=document.getElementById('shift-canvas');
  const demoActivity = DemoActivity.create(document.getElementById('shift-game'), { clock: false });
 const art=new URLSearchParams(location.search).get('art');const treatments={warm:'none',mist:'saturate(.7) brightness(.96)',honey:'sepia(.18) saturate(1.08)',blueprint:'saturate(.7) hue-rotate(20deg)'};if(art)canvas.style.filter=treatments[art]||'none';
 // The time-card entrance restores the automatic checkpoint only after a punch-in.
 const initial=new O.Sim(1,'business');initial.setManualHandling();O.ensureInventoryLayout(initial);if(location.hash.startsWith('#layout=')){try{const text=decodeURIComponent(escape(atob(location.hash.slice(8).replace(/-/g,'+').replace(/_/g,'/'))));initial.restore(O.saves.decodeLayout(text));}catch(error){console.warn('Layout could not be loaded: '+error.message);}}
 // Legacy UI methods call this bridge; the public page never loads the overhead renderer.
 const renderer={canvas,camera:{x:0,y:0,zoom:1},hits:[],frameTimes:[],resize(){},home(){},draw(){O.app?.scenes?.draw();},screen(){return {x:0,y:0};}};
 const app={sim:initial,renderer,audio:new O.Audio(),speed:1,paused:false,hubPause:false,menuPause:false,receivingPause:false,placePause:true,officePause:false,rotated:false,hidden:false,preview:!!art,raf:0};O.app=app;app.ui=new O.UI(app);app.audio.setVolume(app.ui.settings.volume);document.documentElement.style.fontSize=(app.ui.settings.scale*16)+'px';app.scenes=new O.WarehouseScenes(app);app.renderer.canvas=app.scenes.element;app.input=O.bindInput(app);app.receiving=new O.ReceivingView(app);app.places=new O.Places(app);app.office=new O.OfficePapers(app);
 let last=performance.now(),accumulator=0,lastUI=0;
 function orientation(){const before=app.rotated;app.rotated=matchMedia('(pointer:coarse)').matches&&innerHeight>innerWidth;document.getElementById('shift-rotate').hidden=!app.rotated;if(app.rotated&&!before){app.input.suspend();app.places.art.suspend();}}
 function frame(now){const dt=Math.min(.15,(now-last)/1000);last=now;if(!app.paused&&!app.hubPause&&!app.menuPause&&!app.receivingPause&&!app.placePause&&!app.officePause&&!app.rotated&&!app.hidden){accumulator+=dt*app.speed;while(accumulator>=O.DT){app.sim.tick(!app.ui.guideActive());accumulator-=O.DT;}}
  if(!app.receiving.visible&&!app.scenes.element.hidden)app.scenes.advance(dt);app.receiving.advance(dt);if(now-lastUI>150){app.ui.update();app.audio.update(app.sim.s,!app.paused&&!app.menuPause&&!app.rotated&&!app.hidden);lastUI=now;}app.raf=demoActivity.requestFrame(frame);
 }
 window.addEventListener('resize',()=>{app.scenes.resize();app.ui.queueLayout();orientation();}); demoActivity.onChange(active=>{app.hidden=!active;last=performance.now();if(!active){app.input.suspend();app.scenes.suspend();app.receiving.suspend();app.places.art.suspend();app.audio.suspend();}else if(app.audio.context&&!app.paused)app.audio.unlock();});
 window.addEventListener('pagehide',()=>{if(!app.preview&&app.places.started)O.saves.save(app.sim.s);app.audio.suspend();});
 orientation();app.ui.update();app.places.element.focus({preventScroll:true});app.raf=demoActivity.requestFrame(frame);
 root.__oneShift={
  newGame(seed=1,mode='business'){app.sim=new O.Sim(seed,mode);app.sim.setManualHandling();O.ensureInventoryLayout(app.sim);accumulator=0;app.ui.target=null;app.ui.selected=[];app.ui.lastPhase='shift';app.ui.guideSkipped=false;app.ui.osdSeen=false;app.ui.osdUntil=0;app.ui.closeHub();app.places.restored();app.scenes.open('storage');app.ui.update();return this.state();},
  command(c){const r=app.ui.issue(c);return r;},
  step(n){app.sim.step(n);app.ui.update();app.renderer.draw(app.sim.s,app.ui);return this.state();},
  state:()=>app.sim.snapshot(),hash:()=>app.sim.hash(),reconcile:()=>app.sim.reconcile(),
  acceptContract:id=>app.ui.issue({type:'contract',id}),buy:id=>app.ui.issue({type:'buy',id}),
  fastForwardDay(){while(app.sim.s.phase==='shift')app.sim.tick();app.ui.update();return this.state();},
  draw(){app.renderer.draw(app.sim.s,app.ui);},open:tab=>app.ui.openHub(tab),menu:()=>app.ui.settingsMenu(),
  stop(){demoActivity.cancelFrame(app.raf);app.raf=0;},resume(){if(!app.raf){last=performance.now();app.raf=demoActivity.requestFrame(frame);}},
  screen:(x,y)=>app.renderer.screen(x,y),select:hit=>app.ui.select(hit),
  scene:name=>app.scenes.open(name),
  performance(){return {scene:app.scenes.scene,overhead:false};}
 };
})(window);
