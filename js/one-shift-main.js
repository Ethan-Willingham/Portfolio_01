(function(root){
 'use strict';const O=root.OneShift,canvas=document.getElementById('shift-canvas');
 const art=new URLSearchParams(location.search).get('art');const treatments={warm:'none',mist:'saturate(.7) brightness(.96)',honey:'sepia(.18) saturate(1.08)',blueprint:'saturate(.7) hue-rotate(20deg)'};if(art)canvas.style.filter=treatments[art]||'none';
 // For now, browser visits start fresh. Saved slots are loaded explicitly in Menu.
 const initial=new O.Sim(1);if(location.hash.startsWith('#layout=')){try{const text=decodeURIComponent(escape(atob(location.hash.slice(8).replace(/-/g,'+').replace(/_/g,'/'))));initial.restore(O.saves.decodeLayout(text));}catch(error){console.warn('Layout could not be loaded: '+error.message);}}
 const app={sim:initial,renderer:new O.Renderer(canvas),audio:new O.Audio(),speed:1,paused:false,hubPause:false,menuPause:false,rotated:false,hidden:false,preview:!!art,raf:0};O.app=app;app.ui=new O.UI(app);app.audio.setVolume(app.ui.settings.volume);app.renderer.resize();app.renderer.home(app.sim.s);document.documentElement.style.fontSize=(app.ui.settings.scale*16)+'px';app.input=O.bindInput(app);
 let last=performance.now(),accumulator=0,lastUI=0;
 function orientation(){const before=app.rotated;app.rotated=matchMedia('(pointer:coarse)').matches&&innerHeight>innerWidth;document.getElementById('shift-rotate').hidden=!app.rotated;if(app.rotated&&!before)app.input.suspend();}
 function frame(now){const dt=Math.min(.15,(now-last)/1000);last=now;if(!app.paused&&!app.hubPause&&!app.menuPause&&!app.rotated&&!app.hidden){accumulator+=dt*app.speed;while(accumulator>=O.DT){app.sim.tick();accumulator-=O.DT;}}else accumulator=0;
  app.renderer.draw(app.sim.s,app.ui);if(now-lastUI>150){app.ui.update();app.audio.update(app.sim.s,!app.paused&&!app.hubPause&&!app.menuPause&&!app.rotated&&!app.hidden);lastUI=now;}app.raf=requestAnimationFrame(frame);
 }
 window.addEventListener('resize',()=>{const r=app.renderer,fit=r.homeCamera&&['x','y','zoom'].every(k=>Math.abs(r.camera[k]-r.homeCamera[k])<.001);r.resize();if(fit)r.home(app.sim.s);orientation();});document.addEventListener('visibilitychange',()=>{app.hidden=document.hidden;accumulator=0;if(app.hidden)app.audio.suspend();else{last=performance.now();app.audio.unlock();}});
 window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
 window.addEventListener('pagehide',()=>{if(!app.preview)O.saves.save(app.sim.s);app.audio.suspend();});
 orientation();app.ui.update();canvas.focus({preventScroll:true});app.raf=requestAnimationFrame(frame);
 root.__oneShift={
  newGame(seed=1,mode='normal'){app.sim=new O.Sim(seed,mode);app.ui.target=null;app.ui.selected=[];app.ui.lastPhase='shift';app.ui.osdSeen=false;app.ui.osdUntil=0;app.ui.closeHub();app.renderer.home(app.sim.s);app.ui.update();return this.state();},
  command(c){const r=app.ui.issue(c);return r;},
  step(n){app.sim.step(n);app.ui.update();app.renderer.draw(app.sim.s,app.ui);return this.state();},
  state:()=>app.sim.snapshot(),hash:()=>app.sim.hash(),reconcile:()=>app.sim.reconcile(),
  acceptContract:id=>app.ui.issue({type:'contract',id}),buy:id=>app.ui.issue({type:'buy',id}),
  fastForwardDay(){while(app.sim.s.phase==='shift')app.sim.tick();app.ui.update();return this.state();},
  draw(){app.renderer.draw(app.sim.s,app.ui);},open:tab=>app.ui.openHub(tab),menu:()=>app.ui.settingsMenu(),
  stop(){cancelAnimationFrame(app.raf);app.raf=0;},resume(){if(!app.raf){last=performance.now();app.raf=requestAnimationFrame(frame);}},
  screen:(x,y)=>app.renderer.screen(x,y),select:hit=>app.ui.select(hit),
  performance(){const a=app.renderer.frameTimes.slice().sort((a,b)=>a-b);return {mean:a.reduce((a,b)=>a+b,0)/a.length,p95:a[Math.floor(a.length*.95)],frames:a.length,spriteCache:O.sprites.cache.size};}
 };
})(window);
