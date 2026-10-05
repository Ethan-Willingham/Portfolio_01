(function(root){
 'use strict';const O=root.OneShift,canvas=document.getElementById('shift-canvas');
 const app={sim:new O.Sim(1),renderer:new O.Renderer(canvas),audio:new O.Audio(),speed:1,paused:false,hubPause:false,menuPause:false,rotated:false,hidden:false,raf:0};O.app=app;app.ui=new O.UI(app);app.audio.setVolume(app.ui.settings.volume);app.renderer.resize();app.renderer.home(app.sim.s);app.input=O.bindInput(app);
 let last=performance.now(),accumulator=0,lastUI=0;
 function orientation(){app.rotated=matchMedia('(pointer:coarse)').matches&&innerHeight>innerWidth;document.getElementById('shift-rotate').hidden=!app.rotated;}
 function frame(now){const dt=Math.min(.15,(now-last)/1000);last=now;if(!app.paused&&!app.hubPause&&!app.menuPause&&!app.rotated&&!app.hidden){accumulator+=dt*app.speed;while(accumulator>=O.DT){app.sim.tick();accumulator-=O.DT;}}else accumulator=0;
  app.renderer.draw(app.sim.s,app.ui);if(now-lastUI>150){app.ui.update();lastUI=now;}app.raf=requestAnimationFrame(frame);
 }
 window.addEventListener('resize',()=>{app.renderer.resize();orientation();});document.addEventListener('visibilitychange',()=>{app.hidden=document.hidden;accumulator=0;if(app.hidden)app.audio.suspend();else{last=performance.now();app.audio.unlock();}});
 window.addEventListener('pagehide',()=>{O.saves.save(app.sim.s);app.audio.suspend();});
 orientation();app.ui.update();app.raf=requestAnimationFrame(frame);
 root.__oneShift={
  newGame(seed=1,mode='normal'){app.sim=new O.Sim(seed,mode);app.ui.target=null;app.ui.selected=[];app.ui.lastPhase='shift';app.ui.closeHub();app.renderer.home(app.sim.s);app.ui.update();return this.state();},
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
