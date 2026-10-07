(async function(){'use strict';
 const CR=window.ChainReaction,canvas=document.getElementById('machine'),status=document.getElementById('status'),pause=document.getElementById('pause');
 const kit=14,definition=await fetch('/chain-reaction/kits/guided-catch-v'+kit+'.json').then(r=>r.json());
 let sim,watch,view,paused=false,last=performance.now(),accumulator=0,finished=false,wide=false,resetting=false;
 const close={x:12.3,y:2.5,width:8.3,minHeight:6.7},whole={x:8,y:3.3,width:17,minHeight:9.6};
 function showStatus(){const done=watch.report(false).events.filter(e=>e.motionTick!==null).length;status.textContent=finished?(watch.report().pass?'The same marble leaves the catch.':'Prototype transfer check failed.'):['Arrival','Trip','Lift','Timer','Latch','Release','Runout'][Math.min(done,6)];}
 function showPause(){pause.disabled=finished;pause.textContent=finished?'Finished':paused?'Play':'Pause';pause.setAttribute('aria-pressed',String(paused));}
 async function reset(){if(resetting)return;resetting=true;try{const next=await CR.physics.create(definition);sim?.dispose();sim=next;watch=CR.events.watch(sim,definition);finished=false;paused=false;accumulator=0;last=performance.now();showPause();view?.apply(0,sim.state());status.textContent='The arriving marble carries this run.';}finally{resetting=false;}}
 await reset();view=CR.makeView(canvas,[definition]);view.setCamera(close);view.draw();
 pause.onclick=()=>{paused=!paused;showPause();last=performance.now();};
 document.getElementById('reset').onclick=reset;document.getElementById('wide').onclick=()=>{wide=!wide;view.setCamera(wide?whole:close);document.getElementById('wide').textContent=wide?'Close view':'Whole mechanism';};
 addEventListener('resize',()=>view.resize());document.addEventListener('visibilitychange',()=>{last=performance.now();accumulator=0;});
 function frame(now){const dt=Math.min(.1,(now-last)/1000);last=now;if(!paused&&!finished&&!resetting&&!document.hidden){accumulator+=dt;while(accumulator>=CR.physics.DT){sim.step();watch.sample();accumulator-=CR.physics.DT;const marble=sim.bodies.get('marble');if(marble.translation().x>=16){finished=true;paused=true;showPause();break;}}view.apply(0,sim.state());showStatus();}
 if(view.needsDraw())view.draw(now,false,sim.tick/240,!paused&&!finished);requestAnimationFrame(frame);}
 window.ChainReactionCatch={ready:true,definition,quality:()=>view.quality(),state:()=>({tick:sim.tick,paused,finished,events:watch.report(false),poses:sim.state()}),async seek(tick){if(resetting)return;resetting=true;paused=true;try{const next=await CR.physics.create(definition);sim.dispose();sim=next;watch=CR.events.watch(sim,definition);for(let n=0;n<tick;n++){sim.step();watch.sample();}finished=sim.bodies.get('marble').translation().x>=16;accumulator=0;last=performance.now();showPause();view.apply(0,sim.state());view.draw();showStatus();}finally{resetting=false;}}};
 requestAnimationFrame(frame);
})();
