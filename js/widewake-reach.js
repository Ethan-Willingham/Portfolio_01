/* The title, ports, navigation and production all own the same campaign now. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id),R=WidewakeReach,E=WidewakeEstuary,O=WidewakeOcean,U=WidewakeReachUI;
  U.hydrate();
  const activity=DemoActivity.create($('game')),front=new WidewakeFront($('title-sea'),$('title-logo'));
  const defaults={sound:true,volume:.2,effects:.65,music:.18,ambience:.45,reduceMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,controllerRumble:true};let settings={...defaults};
  try{const p=JSON.parse(localStorage.getItem('widewake-reach-settings')||'{}');for(const k of ['sound','reduceMotion'])if(typeof p[k]==='boolean')settings[k]=p[k];if(Number.isFinite(p.volume))settings.volume=E.clamp(p.volume,0,.5);}catch{}
  // Voyages live only in memory until saving is deliberately reintroduced.
  let game=null,view=null,sound=null,mode='title',modalReturn='title',dirty=true,last=0,accumulator=0,uiTime=0,noticeUntil=0,usingPad=false,service='trade',serviceTab='recruit',tradeSide='buy',good='salt',quantity=8,request=0,selected=null,plan=null,stickId=null,pan=null,pinch=null,controller;
  let voyage=null,routePolicy="sheltered";
  const dialogStack=[];
  const keys=new Set(),stick={x:0,y:0},pointers=new Map(),frameTimes=new Float32Array(600),stepTimes=new Float32Array(600);let samples=0;
  const money=n=>Math.round(n).toLocaleString()+' c',allDestinations=()=>[...E.ports,...R.sites.filter(s=>game.rank>=s.rank)];
  function clear(){cameraMenu(false);keys.clear();stopStick();buttonTouches.clear();for(const id of pointers.keys())if(water.hasPointerCapture(id))water.releasePointerCapture(id);pointers.clear();pan=pinch=null;touchGesture=false;controller?.reset();}
  function wake(){if(!settings.sound||!activity.active())return;try{sound=sound||new WidewakeAudio({active:()=>activity.active(),settings:()=>settings});sound.wake();}catch{}}
  function notify(text){$('reach-notice').textContent=text;noticeUntil=activity.now()+4500;if(mode==='service')$('service-feedback').textContent=text;}
  function refreshTitle(){if(mode!=='title')return;$('resume-voyage').hidden=!voyage;$('start-voyage').classList.toggle('ww-primary',!voyage);}
  function setPortCamera(){const p=E.ports.find(p=>p.id===game.port);if(!p)return;view.follow=false;view.anchor=null;view.offset={x:0,y:0};view.camera={x:p.x-26,y:p.y-88};view.zoom=view.targetZoom=p.id==='reeds'?5:2.8;if(p.theme){const scale=3.8,shift=O.unproject(view.width*.16/scale,0);view.camera={x:p.x-Math.cos(p.shoreAngle)*(p.shore+5)-shift.x,y:p.y-Math.sin(p.shoreAngle)*(p.shore+5)-shift.y};view.zoom=view.targetZoom=scale/view.baseScale;}dirty=true;}
  function sailCamera(){view.follow=true;view.anchor=null;view.offset={x:0,y:0};view.configureCamera();view.targetZoom=view.stops.helm;view.camera={x:game.player.x,y:game.player.y};}
  function bindView(){view.reduced=settings.reduceMotion;view.onContextLost=()=>{openDialog('reach-menu','menu');$('menu-status').textContent='Graphics paused. Restoring the scene...';};view.onContextRestored=()=>{dirty=true;$('menu-status').textContent='Graphics restored. Resume when ready.';};if(view.terrain){view.terrain.onReady=()=>{dirty=true;updateUI();};view.terrain.onError=message=>{$('boot-error').hidden=false;$('boot-error').textContent=message;openDialog('reach-menu','menu');};}}
  function enter(value){dialogStack.length=0;for(const d of document.querySelectorAll('dialog[open]'))d.close();clear();game=value;voyage=null;$('reach-notice').textContent='';$('reach-water').setAttribute('aria-label','W or Up drives forward. A/D or Left/Right turn. S or Down brakes. E interacts, M opens the chart, Escape pauses.');$('reach').classList.remove('in-combat');view?.dispose();$('title-screen').hidden=true;$('reach').hidden=false;document.body.classList.remove('at-title');view=new WidewakeEstuaryView.View($('reach-water'),game);bindView();mode=game.port?'port':'sailing';if(game.port)setPortCamera();else sailCamera();last=accumulator=0;dirty=true;updateUI();wake();}
  function start(fresh){const value=fresh?new R.Game():voyage;if(value)enter(value);}
  $('start-voyage').onclick=()=>{if(voyage)openDialog('new-dialog','menu');else start(true);};$('confirm-new').onclick=()=>start(true);$('resume-voyage').onclick=()=>start(false);
  function title(){if(game&&!game.endgame)voyage=game;dialogStack.length=0;clear();request++;view?.dispose();view=null;game=null;$('menu-status').textContent='';$('reach').classList.remove('in-combat');for(const d of document.querySelectorAll('dialog[open]'))d.close();mode='title';$('reach').hidden=true;$('title-screen').hidden=false;document.body.classList.add('at-title');sound?.suspend();refreshTitle();$(voyage?'resume-voyage':'start-voyage').focus({preventScroll:true});}
  function enterCombat(){
    if(game&&!game.endgame)voyage=game;
    dialogStack.length=0;for(const d of document.querySelectorAll('dialog[open]'))d.close();clear();request++;
    view?.dispose();$('title-screen').hidden=true;$('reach').hidden=false;$('reach').classList.add('in-combat');document.body.classList.remove('at-title');
    game=new WidewakeCombat.Endgame();view=new WidewakeCombat.View($('reach-water'),game);bindView();mode='sailing';
    $('reach-water').setAttribute('aria-label','W or Up drives forward. A/D or Left/Right turn. S or Down brakes. Weapons fire automatically. E orders the fleet to hold or follow. Escape pauses.');
    last=accumulator=0;samples=0;dirty=true;updateUI();wake();$('reach-water').focus({preventScroll:true});
  }
  function leaveCombat(){const previous=voyage;voyage=null;if(previous)enter(previous);else title();}
  $('title-combat').onclick=enterCombat;$('menu-combat').onclick=enterCombat;$('combat-again').onclick=enterCombat;$('leave-combat').onclick=leaveCombat;$('combat-return').onclick=leaveCombat;
  function combatUI(){
    const b=game,p=b.player,remaining=Math.max(0,Math.ceil(b.duration-b.workTime)),alive=b.ships.filter(s=>s.hp>0).length;
    $('reach-resume').disabled=view.lost;$('port-scene').hidden=true;$('vessel-status').hidden=false;$('helm-controls').hidden=false;$('sailing-actions').hidden=false;
    $('place').textContent='FLAGSHIP';$('hull-meter').value=p.hp/p.maxHp;$('hull-meter').title=Math.ceil(p.hp)+' / '+p.maxHp+' hull';$('hull-meter').setAttribute('aria-valuetext',Math.ceil(p.hp/p.maxHp*100)+' percent hull');$('hull-value').textContent=Math.ceil(p.hp/p.maxHp*100)+'% hull';$('vessel-status').classList.toggle('damaged',p.hp<p.maxHp*.35);$('vessel-status').classList.remove('shallow');
    for(const id of ['reach-course','work-status','chart-open'])$(id).hidden=true;
    $('combat-status').hidden=false;$('combat-clock').textContent=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');$('combat-progress').value=b.workTime/b.duration;
    $('combat-order').textContent=b.work?(b.workActive?'Protect the workboats':'Workboats deploying'):'Fleet following';$('combat-tally').textContent=b.kills.toLocaleString()+' sunk · '+alive+' boats';
    $('context-action').hidden=false;$('context-action').disabled=false;$('context-label').textContent=b.work?'Fleet follow':'Hold here';$('context-action').title=b.work?'Move the fleet with you. Production pauses.':'Hold position and resume production.';
    for(const button of document.querySelectorAll('[data-zoom]'))button.setAttribute('aria-pressed',String(Math.abs(view.targetZoom-view.stops[button.dataset.zoom])<.01));
    if(b.events.length)notify(b.events.splice(0).at(-1));
    if(b.result&&mode==='sailing'){
      $('combat-result-title').textContent=b.result;$('combat-result-stats').innerHTML='<span><strong>'+b.kills.toLocaleString()+'</strong>raiders sunk</span><span><strong>'+alive+' / 24</strong>boats home</span><span><strong>'+Math.floor(b.produced.fish+b.produced.oil).toLocaleString()+'</strong>cargo secured</span>';
      $('combat-return').textContent=voyage?'Return to voyage':'Title screen';openDialog('combat-result','result');sound?.play(b.result==='Holds secured'?'complete':'sink');
    }
  }
  function openDialog(id,kind){
    const active=document.querySelector('dialog[open]');
    if(!active)modalReturn=mode;
    else if(active.id!==id){dialogStack.push({id:active.id,kind:mode,focus:document.activeElement});active.close();}
    clear();request++;mode=kind;last=accumulator=0;sound?.suspend();
    if(id==='reach-menu'){
      $('pause-title').textContent=modalReturn==='title'?'Settings':'Paused';
      $('menu-combat').textContent=game?.endgame?'Restart combat':'Endgame combat';$('leave-combat').hidden=!game?.endgame||!voyage;
      $('reach-resume').textContent=modalReturn==='title'?'Back':'Resume';if(modalReturn==='title')$('reach-resume').disabled=false;
      $('return-title').hidden=modalReturn==='title';
      if(!active)$('settings-fold').open=modalReturn==='title';
    }
    if(id==='help-dialog'){$('help-actions').textContent=game?.endgame?'E orders the fleet to follow or hold. Guns and broadsides fire automatically.':'E docks or deploys workboats. M opens the chart. All weapons choose their own targets.';$('help-voyage').hidden=!!game?.endgame;$('help-combat').hidden=!game?.endgame;}
    if(!$(id).open)$(id).showModal();dirty=true;
  }
  function closeDialog(id){
    if(id==='combat-result'){leaveCombat();return;}
    $(id).close();request++;clear();last=accumulator=0;dirty=true;
    const previous=dialogStack.pop();
    if(previous){mode=previous.kind;$(previous.id).showModal();previous.focus?.focus({preventScroll:true});return;}
    mode=modalReturn;if(!game&&mode!=='title'){title();return;}
    if(mode==='sailing'){$('reach-water').focus({preventScroll:true});wake();}else if(mode==='port')wake();
  }
  for(const d of document.querySelectorAll('dialog'))d.addEventListener('cancel',e=>{e.preventDefault();if(d.id==='combat-result')leaveCombat();else closeDialog(d.id);});
  for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>closeDialog(b.dataset.close);
  $('title-settings').onclick=()=>openDialog('reach-menu','menu');$('title-handbook').onclick=()=>openDialog('help-dialog','menu');$('title-credits').onclick=()=>openDialog('credits-dialog','menu');$('reach-pause').onclick=()=>openDialog('reach-menu','menu');$('return-title').onclick=title;$('reach-help').onclick=()=>openDialog('help-dialog','menu');
  $('title-version').textContent=R.version+' / '+(window.WidewakeDesktop?'Desktop':'Web edition');$('title-quit').hidden=!window.WidewakeDesktop;$('title-quit').onclick=()=>WidewakeDesktop.quit();document.addEventListener('fullscreenchange',()=>{$('title-fullscreen').textContent=document.fullscreenElement?'Windowed':'Full screen';});window.addEventListener('widewake-fullscreen',e=>{$('title-fullscreen').textContent=e.detail?'Windowed':'Full screen';});$('title-fullscreen').onclick=async()=>{try{if(window.WidewakeDesktop)await WidewakeDesktop.toggleFullscreen();else if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{}};
  $('sound-enabled').checked=settings.sound;$('reduce-motion').checked=settings.reduceMotion;$('volume').value=settings.volume;
  function preferences(){settings.sound=$('sound-enabled').checked;settings.reduceMotion=$('reduce-motion').checked;settings.volume=Number($('volume').value);if(view)view.reduced=settings.reduceMotion;if(!settings.sound)sound?.suspend();else wake();try{localStorage.setItem('widewake-reach-settings',JSON.stringify(settings));}catch{}dirty=true;}
  for(const id of ['sound-enabled','reduce-motion'])$(id).onchange=preferences;$('volume').oninput=preferences;
  function updateUI(){if(!game||!view)return;if(game.endgame){combatUI();return;}$('combat-status').hidden=true;$('chart-open').hidden=false;$('context-action').title='';const p=game.player,w=game.water,docked=!!game.port,port=E.ports.find(p=>p.id===game.port),ready=view.terrain.ready&&!view.lost&&!view.terrain.failed;
    $('port-scene').hidden=!docked;$('vessel-status').hidden=docked;$('helm-controls').hidden=docked;$('sailing-actions').hidden=docked;$('place').textContent=p.name.toUpperCase();$('sounder').textContent=Math.max(0,w.depth).toFixed(1)+' m';$('water-kind').textContent=(w.salinity<.12?'Fresh':w.salinity>.85?'Salt':'Brackish')+' water';$('hull-meter').value=p.hp/p.maxHp;$('hull-meter').title=Math.ceil(p.hp)+' / '+Math.ceil(p.maxHp)+' hull';$('hull-meter').setAttribute('aria-valuetext',Math.ceil(p.hp/p.maxHp*100)+' percent hull');$('hull-value').textContent=Math.ceil(p.hp/p.maxHp*100)+'% hull';$('vessel-status').classList.toggle('damaged',p.hp/p.maxHp<.35);$('vessel-status').classList.toggle('shallow',w.depth-p.draft<1);
    $('cast-off').disabled=!ready;$('cast-off-label').textContent=ready?'Cast off':'Preparing...';$('reach-resume').disabled=!!game&&!ready;
    $('reach-course').hidden=docked||!game.route;$('course-name').textContent=game.route?.destination.name||'';
    const op=game.operation,site=op&&R.sites.find(s=>s.id===op.id);$('work-status').hidden=!op;$('work-name').textContent=site?(game.workActive?'Protect ':'Deploying at ')+site.name:'';$('work-progress').value=op?op.elapsed/site.duration:0;
    const near=game.nearPort(),work=game.nearSite();$('context-action').hidden=!!op||!near&&!work;$('context-label').textContent=near?(Math.hypot(p.vx,p.vy)>3?'Slow to dock':game.nearThreats()?'Clear the approach':game.ships.some(s=>s.hp>0&&Math.hypot(s.x-near.x,s.y-near.y)>360)?'Fleet approaching':'Dock'):op?'Recall':work?.type==='fish'?'Deploy trawlers':'Deploy oil tenders';$('context-action').disabled=!!near&&(Math.hypot(p.vx,p.vy)>3||game.nearThreats()>0||game.ships.some(s=>s.hp>0&&Math.hypot(s.x-near.x,s.y-near.y)>360));
    $('camera-toggle').title='Camera distance';for(const b of document.querySelectorAll('[data-zoom]'))b.setAttribute('aria-pressed',String(Math.abs(view.targetZoom-view.stops[b.dataset.zoom])<.01));
    if(port){$('port-name').textContent=port.name;$('port-water').textContent=port.description;$('port-coins').textContent=Math.round(game.coins).toLocaleString();$('port-hold').textContent=game.cargo+'/'+game.capacity;const objective=game.objective();$('charter-title').textContent=objective.title;$('charter-detail').textContent=objective.detail;for(const b of document.querySelectorAll('[data-service]')){const rank=b.dataset.service==='fleet'?2:b.dataset.service==='yard'?3:1;b.classList.toggle('locked',game.rank<rank);const small=b.querySelector('small');if(small){const locked=game.rank<rank;if(Boolean(small.firstChild)!==locked)small.innerHTML=locked?U.icon('lock'):'';b.setAttribute('aria-label',(b.dataset.service==='fleet'?'Fleet':'Shipyard')+(locked?', locked. '+(rank===2?'Complete the salt delivery.':'Finish a fishing watch.') :''));}}}
    if(game.events.length){notify(game.events.splice(0).join(' · '));}else if(game.contactTime&&mode==='sailing')notify(game.contact);
    if(game.port&&mode==='sailing'){mode='port';clear();setPortCamera();}
  }
  $('cast-off').onclick=()=>{if(game.castOff()){mode='sailing';clear();sailCamera();updateUI();wake();$('reach-water').focus({preventScroll:true});}};
  function contextAction(){if(mode!=='sailing')return;if(game.endgame){game.toggleWork();updateUI();return;}if(game.nearPort()){if(game.dock()){mode='port';clear();setPortCamera();sound?.play('dock');}}else if(game.operation){game.stopWork();notify('Workboats recalled');}else if(!game.startWork())notify('Bring a workboat with space in its hold.');updateUI();}
  $('context-action').onclick=contextAction;$('recall').onclick=()=>{game.stopWork();notify('Workboats recalled');updateUI();};$('take-helm').onclick=()=>{game.cancel();updateUI();};
  const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const boatArt=type=>'<canvas data-vessel="'+type+'" width="200" height="128" aria-hidden="true"></canvas>';
  const boatUse={gunboat:'Guards the convoy',trawler:'Catches fish',repair:'Repairs nearby boats',oilrig:'Extracts oil',screen:'Blasts nearby groups',battery:'Bombards groups of raiders'};
  const fittingUse={engine:'+10% speed',hold:'+8 hold per boat',guns:'+20% gun damage',hull:'+18% hull strength'};
  function tradeLimit(){
    if(tradeSide==='sell')return Math.min(1000,game.amount(good));
    let total=0,count=0,limit=Math.min(1000,game.capacity-game.cargo);
    while(count<limit){total+=game.price(good,true,game.port,count);if(total>game.coins)break;count++;}return count;
  }
  function renderService(){
    const body=$('service-body'),focus=document.activeElement?.dataset.focus,scroll=body.scrollTop,goodsScroll=body.querySelector('.goods-list')?.scrollTop||0;
    const summary='<div class="service-summary"><span>'+U.icon('coin')+Math.round(game.coins).toLocaleString()+' <small>coins</small></span><span>'+U.icon('hold')+game.cargo+'/'+game.capacity+' <small>hold</small></span></div>';
    let html=summary;
    const locked=service==='fleet'&&game.rank<2||service==='yard'&&game.rank<3;
    if(locked){
      html+='<div class="locked-service">'+U.icon('lock')+'<div><h3>'+(service==='fleet'?'Fleet locked':'Shipyard locked')+'</h3><p>'+(service==='fleet'?'Sell 8 salt at Lantern Quay.':'Finish a fishing watch at Tern Shoal.')+'</p></div><button class="reach-primary" data-job="chart">Show on chart '+U.icon('arrow')+'</button></div>';
      if(game.repairCost())html+='<button class="repair-fleet" data-job="repair" '+(game.repairCost()>game.coins?'disabled':'')+'>Repair fleet <strong>'+money(game.repairCost())+'</strong></button>';
    }else if(service==='trade'){
      const limit=tradeLimit(),buying=tradeSide==='buy',total=game.quote(good,quantity,buying),amount=game.amount(good),available=quantity<=limit;
      const others=E.ports.filter(p=>p.id!==game.port).map(p=>({name:p.name,price:game.price(good,false,p.id)})).sort((a,b)=>b.price-a.price);
      let reason='';if(!available)reason=buying?(game.capacity-game.cargo<quantity?'Not enough room in the hold.':'Not enough coins.'):(amount?'Only '+amount+' aboard.':'None aboard.');
      html+='<div class="trade-layout"><nav class="goods-list" aria-label="Cargo for trade">'+Object.entries(R.goods).filter(([k])=>!['oil','relic'].includes(k)||game.amount(k)>0||game.rank>=3).map(([k,g])=>'<button data-good="'+k+'" data-focus="good-'+k+'" aria-pressed="'+(good===k)+'">'+U.cargo(k)+'<span>'+g.name+'<small>'+game.amount(k)+' aboard</small></span></button>').join('')+'</nav><div class="trade-order">';
      html+='<div class="order-head">'+U.cargo(good)+'<div><h3>'+R.goods[good].name+'</h3><small>'+amount+' aboard</small></div></div>';
      html+='<div class="trade-side" role="group" aria-label="Order type">'+['buy','sell'].map(side=>'<button data-side="'+side+'" data-focus="side-'+side+'" aria-pressed="'+(tradeSide===side)+'">'+(side==='buy'?'Buy':'Sell')+'<small>'+money(game.price(good,side==='buy'))+' each</small></button>').join('')+'</div>';
      html+='<div class="quantity-row" role="group" aria-label="Order quantity"><button data-qty="-1" data-focus="less" aria-label="One fewer" '+(quantity<=1?'disabled':'')+'>−</button><output aria-label="Quantity">'+quantity+'</output><button data-qty="1" data-focus="more" aria-label="One more" '+(quantity>=Math.max(1,limit)?'disabled':'')+'>+</button><button class="quantity-max" data-qty="max" data-focus="max" '+(!limit?'disabled':'')+' aria-label="'+(buying?'Largest affordable order that fits the hold':'Sell all '+amount+' aboard')+'">Max</button></div>';
      html+='<button class="trade-confirm reach-primary" data-trade="'+tradeSide+'" data-focus="confirm" '+(!available?'disabled':'')+'><span>'+(buying?'Buy ':'Sell ')+quantity+'</span><strong>'+money(total)+'</strong></button><p class="order-note '+(reason?'warning':'')+'">'+reason+'</p><p class="trade-context"><strong>'+others[0].name+'</strong> pays '+money(others[0].price)+' each.</p></div></div>';
    }else if(service==='fleet'){
      html+='<nav class="service-tabs" aria-label="Fleet view"><button data-service-tab="owned" data-focus="owned" aria-pressed="'+(serviceTab==='owned')+'">Your boats · '+game.ships.length+'</button><button data-service-tab="recruit" data-focus="recruit" aria-pressed="'+(serviceTab!=='owned')+'">Add a boat</button></nav>';
      if(game.repairCost())html+='<button class="repair-fleet" data-job="repair" '+(game.repairCost()>game.coins?'disabled':'')+'>Repair fleet <strong>'+money(game.repairCost())+'</strong></button>';
      if(serviceTab==='owned')html+='<div class="fleet-manifest">'+game.ships.map(s=>'<article class="offer">'+boatArt(s.type)+'<div><h3>'+escapeText(s.name)+'</h3><small>'+Math.ceil(s.hp/s.maxHp*100)+'% hull · '+R.used(s)+'/'+s.hold+' hold</small></div></article>').join('')+'</div>';
      else{
        for(const k of ['trawler','gunboat','repair','oilrig','screen','battery']){const boat=R.boats[k];if(game.rank<boat.rank)continue;html+='<article class="offer">'+boatArt(k)+'<div><h3>'+boat.name+'</h3><small>'+boatUse[k]+'<br>'+boat.hold+' hold · '+boat.draft+' m draft</small></div><button data-hire="'+k+'" data-focus="hire-'+k+'" '+(game.coins<boat.cost||game.ships.length>=24?'disabled':'')+'><span>Buy boat</span><strong>'+money(boat.cost)+'</strong></button></article>';}
        if(game.rank<4)html+='<p>'+(game.rank<3?'A fishing watch unlocks tenders.':'An oil watch unlocks heavy escorts.')+'</p>';
      }
    }else if(service==='yard'){
      html+='<nav class="service-tabs" aria-label="Shipyard view"><button data-service-tab="fittings" data-focus="fittings" aria-pressed="'+(serviceTab!=='hulls')+'">Fittings</button><button data-service-tab="hulls" data-focus="hulls" aria-pressed="'+(serviceTab==='hulls')+'">New hull</button></nav>';
      if(serviceTab!=='hulls')html+=Object.entries(R.upgrades).map(([k,f])=>'<article class="offer">'+U.icon(k)+'<div><h3>'+f.name+'</h3><small>'+fittingUse[k]+'</small><div class="fitting-level" aria-label="Level '+game.levels[k]+' of 5">'+Array.from({length:5},(_,i)=>'<i class="'+(i<game.levels[k]?'filled':'')+'"></i>').join('')+'</div></div><button data-upgrade="'+k+'" data-focus="upgrade-'+k+'" '+(game.levels[k]>=5||game.coins<f.base*(game.levels[k]+1)?'disabled':'')+'><span>'+(game.levels[k]>=5?'Complete':'Fit upgrade')+'</span><strong>'+money(f.base*(game.levels[k]+1))+'</strong></button></article>').join('');
      else html+=Object.entries(R.hulls).filter(([k])=>k!=='launch').map(([k,h])=>'<article class="offer">'+boatArt(k)+'<div><h3>'+h.name+'</h3><small>'+h.hold+' hold · '+h.draft+' m draft'+(game.rank<h.rank?'<br>Complete an oil watch':'')+'</small></div><button data-hull="'+k+'" data-focus="hull-'+k+'" '+(game.rank<h.rank||game.coins<h.cost||game.player.type===k?'disabled':'')+'><span>'+(game.player.type===k?'Aboard':'Buy hull')+'</span><strong>'+money(h.cost)+'</strong></button></article>').join('');
    }else{
      html+='<div class="log-stats"><span>'+game.visited.size+'<small>Ports visited</small></span><span>'+game.kills+'<small>Raiders sunk</small></span><span>'+game.stats.watches+'<small>Watches</small></span></div>';
      html+='<span class="service-subtitle">Places remembered</span>'+game.discoveries.map(id=>'<div class="log-entry">'+U.icon('chart')+'<strong>'+escapeText(WidewakeWaterways.landmarks.find(m=>m.id===id).name)+'</strong></div>').join('');
      html+=game.collection.length?'<span class="service-subtitle">Rare finds</span>'+game.collection.map(n=>'<div class="log-entry">'+U.cargo(n==='Amber nautilus'?'relic':'fish')+'<strong>'+escapeText(n)+'</strong></div>').join(''):'<div class="empty-collection">'+U.icon('fish')+'<p>No rare finds yet.</p></div>';
      html+='<p>'+game.objective().detail+'</p>';
    }
    body.innerHTML=html;$('service-title').textContent={trade:'Trade',fleet:'Fleet',yard:'Shipyard',log:'Logbook'}[service];$('service-port').textContent=E.ports.find(p=>p.id===game.port)?.name||'';$('port-service').dataset.sheet=service;
    U.vessels(body,view);if(focus){let target=body.querySelector('[data-focus="'+focus+'"]');if(target?.disabled)target=body.querySelector('[data-side="'+tradeSide+'"]')||body.querySelector('[data-service-tab][aria-pressed=true]');target?.focus({preventScroll:true});}body.scrollTop=scroll;const list=body.querySelector('.goods-list');if(list)list.scrollTop=goodsScroll;
  }
  for(const b of document.querySelectorAll('[data-service]'))b.onclick=()=>{
    service=b.dataset.service;serviceTab=service==='fleet'?'recruit':'fittings';
    tradeSide=game.amount(good)>0&&game.port!=='yard'?'sell':'buy';quantity=Math.min(8,Math.max(1,tradeLimit()));
    $('service-feedback').textContent='';renderService();openDialog('port-service','service');$('service-body').scrollTop=0;
  };
  $('service-body').onclick=e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;let result=false,message='';
    if(b.dataset.good){good=b.dataset.good;quantity=Math.min(8,Math.max(1,tradeLimit()));$('service-feedback').textContent='';renderService();return;}
    if(b.dataset.side){tradeSide=b.dataset.side;quantity=Math.min(quantity,Math.max(1,tradeLimit()));$('service-feedback').textContent='';renderService();return;}
    if(b.dataset.qty){quantity=b.dataset.qty==='max'?Math.max(1,tradeLimit()):E.clamp(quantity+Number(b.dataset.qty),1,Math.max(1,tradeLimit()));renderService();return;}
    if(b.dataset.serviceTab){serviceTab=b.dataset.serviceTab;renderService();$('service-body').scrollTop=0;return;}
    if(b.dataset.trade){const buying=b.dataset.trade==='buy';result=game.trade(good,quantity,buying);if(result)message=(buying?'Bought ':'Sold ')+quantity+' '+R.goods[good].name.toLowerCase()+' · '+money(result.total);}
    else if(b.dataset.hire){result=game.hire(b.dataset.hire);message=result?'Boat joined the fleet':'No safe berth for that hull here.';}
    else if(b.dataset.upgrade){result=game.upgrade(b.dataset.upgrade);message=result?'Upgrade fitted':'';}
    else if(b.dataset.hull){result=game.changeHull(b.dataset.hull);if(result){view.poses=[];setPortCamera();}message=result?'New flagship ready':'This berth or your cargo needs a different hull.';}
    else if(b.dataset.job==='repair'){result=game.repair();message='Fleet repaired';}
    else if(b.dataset.job==='chart'){closeDialog('port-service');objectiveChart();return;}
    if(result){sound?.play('buy');}renderService();updateUI();$('service-feedback').textContent=message||'That order is unavailable.';dirty=true;
  };
  function drawChart(){
    const canvas=$('chart-map'),r=canvas.getBoundingClientRect(),ratio=Math.min(2,devicePixelRatio);
    canvas.width=Math.round(r.width*ratio);canvas.height=Math.round(r.height*ratio);
    const c=canvas.getContext('2d');c.scale(ratio,ratio);
    const w=r.width,h=r.height,scale=Math.min((w-40)/7100,(h-40)/8400),cx=w/2,cy=20+5600*scale,point=(x,y)=>({x:cx+x*scale,y:cy+y*scale});
    c.fillStyle='#d2d2b9';c.fillRect(0,0,w,h);c.fillStyle='#a8c0bb';c.fillRect(0,point(0,1280).y,w,h);
    c.lineJoin=c.lineCap='round';
    for(const edge of [true,false])for(const path of game.field.paths)for(let i=1;i<path.points.length;i++){
      const a=path.points[i-1],b=path.points[i],p=point(a.x,a.y),q=point(b.x,b.y);
      c.lineWidth=Math.max(path.id==='cut'?2:3,(a.width+b.width)*scale)+(edge?2:0);c.strokeStyle=edge?'#7d9e99':'#a8c0bb';c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke();
    }
    c.strokeStyle='#405e6420';c.lineWidth=.5;
    for(let x=-6000;x<=6000;x+=2000){const p=point(x,0);c.beginPath();c.moveTo(p.x,0);c.lineTo(p.x,h);c.stroke();}
    for(let y=-6000;y<=4000;y+=2000){const p=point(0,y);c.beginPath();c.moveTo(0,p.y);c.lineTo(w,p.y);c.stroke();}
    for(const hazard of WidewakeWaterways.hazards){const q=point(hazard.x,hazard.y);c.strokeStyle=hazard.kind==='heat'?'#ac6448':'#637c8b';c.lineWidth=1;c.beginPath();c.arc(q.x,q.y,Math.max(5,hazard.radius*scale),0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(q.x-2,q.y);c.lineTo(q.x+2,q.y);c.moveTo(q.x,q.y-2);c.lineTo(q.x,q.y+2);c.stroke();}
    if(h>330){c.font='italic 11px "Segoe UI",sans-serif';c.fillStyle='#506e6b';for(const [name,x,y]of [['Gorilla Narrows',-3100,-1800],['Drowned town',-3100,-3500],['Blackglass',1800,-1750],['Leeward',2650,-3750]]){const p=point(x,y);c.fillText(name,E.clamp(p.x,10,w-95),p.y);}}
    const route=plan||game.route;
    if(route){c.strokeStyle='#385964';c.lineWidth=1.5;c.setLineDash([4,4]);c.beginPath();for(const [i,p]of route.points.entries()){const q=point(p.x,p.y);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);}c.stroke();c.setLineDash([]);}
    c.font='11px "Segoe UI",sans-serif';
    for(const port of allDestinations()){
      const p=point(port.x,port.y),active=selected===port.id;
      c.fillStyle=active?'#203a45':'#526b6b';
      if(port.type){c.beginPath();c.arc(p.x,p.y,4,0,Math.PI*2);c.fill();}else c.fillRect(p.x-3,p.y-3,6,6);
      if(active){c.strokeStyle='#203a45';c.lineWidth=1.5;c.beginPath();c.arc(p.x,p.y,8,0,Math.PI*2);c.stroke();}
      if((h<340||port.type)&&!active&&port.id!==game.port)continue;
      const tw=c.measureText(port.name).width,left=port.x<0;
      // Keep labels on the paper even on a narrow phone chart.
      const x=E.clamp(left?p.x-tw-10:p.x+10,8,w-tw-8),y=E.clamp(p.y-10,14,h-18);
      c.fillStyle='#dedbc3e8';c.fillRect(x-3,y-10,tw+6,15);c.fillStyle='#203a45';c.textAlign='left';c.fillText(port.name,x,y+1);
    }
    const p=point(game.player.x,game.player.y);c.save();c.translate(p.x,p.y);c.rotate(game.player.angle+Math.PI/2);c.fillStyle='#a86642';c.strokeStyle='#f0e9cf';c.lineWidth=1.5;c.beginPath();c.moveTo(0,-7);c.lineTo(4,5);c.lineTo(0,3);c.lineTo(-4,5);c.closePath();c.fill();c.stroke();c.restore();
    c.strokeStyle='#526d70';c.fillStyle='#526d70';c.textAlign='center';c.font='9px "Commit Mono",monospace';c.fillText('N',w-24,18);c.beginPath();c.moveTo(w-24,24);c.lineTo(w-28,35);c.lineTo(w-24,32);c.lineTo(w-20,35);c.closePath();c.fill();
    c.textAlign='left';c.fillText('1 km',14,h-17);c.lineWidth=1;c.beginPath();c.moveTo(14,h-12);c.lineTo(14,h-8);c.lineTo(14+scale*1000,h-8);c.lineTo(14+scale*1000,h-12);c.stroke();canvas.chartPoint=point;
  }
  function passageTime(seconds){const format=s=>Math.floor(s/60)+':'+String(Math.round(s%60)).padStart(2,'0');return format(Math.round(seconds*.8/5)*5)+' to '+format(Math.round(seconds*1.2/5)*5);}
  for(const b of document.querySelectorAll('[data-route-policy]'))b.onclick=()=>{routePolicy=b.dataset.routePolicy;for(const other of document.querySelectorAll('[data-route-policy]'))other.setAttribute('aria-pressed',String(other===b));if(selected)selectPort(selected);};
  function openChart(){if(!game||game.endgame)return;openDialog('reach-chart','chart');plan=null;selected=null;$('route-name').textContent='Choose a destination';$('route-detail').textContent='';$('set-course').disabled=true;$('chart-destinations').innerHTML=allDestinations().map(p=>'<button data-port="'+p.id+'">'+U.icon(p.type==='fish'?'fish':p.type==='oil'?'engine':'sail')+'<span>'+p.name+'<small>'+(p.id===game.port?'Docked here':p.type==='fish'?'Fishing':p.type==='oil'?'Oil grounds':['Sheltered','Light patrols','Fast raiders','Gunboats','Heavy patrols'][game.field.sample(p.x,p.y).region.tier])+'</small></span></button>').join('');drawChart();}
  async function selectPort(id){const destination=allDestinations().find(p=>p.id===id);if(!destination)return;selected=id;plan=null;const token=++request;$('route-name').textContent='Checking passage...';$('route-detail').textContent='';$('set-course').disabled=true;for(const b of document.querySelectorAll('[data-port]'))b.setAttribute('aria-pressed',String(b.dataset.port===id));drawChart();try{const route=await view.terrain.route({...game.routeHull(),routePolicy},destination);if(token!==request||mode!=='chart')return;plan=route;$('route-name').textContent=route?destination.name:'Shallow access';$('route-detail').textContent=route?(route.distance/1000).toFixed(1)+' km · '+passageTime(route.seconds)+' sailing · '+['Sheltered','Light patrols','Fast raiders','Gunboats','Heavy patrols'][route.tier]+(route.hazards.length?' · '+route.hazards.map(id=>id==='furnace'?'Hot water damages hulls':WidewakeWaterways.hazards.find(h=>h.id===id).name).join(', '):''):'Your fleet needs a deeper approach.';$('set-course').disabled=!route;drawChart();}catch(error){if(token===request){$('route-name').textContent='Route unavailable';$('route-detail').textContent=error.message;}}}
  function objectiveChart(){openChart();const o=game.objective(),id=o.port||o.site;if(id)selectPort(id);}
  $('charter-chart').onclick=objectiveChart;
  $('chart-open').onclick=openChart;$('harbor-chart').onclick=openChart;$('chart-destinations').onclick=e=>{const b=e.target.closest('[data-port]');if(b)selectPort(b.dataset.port);};$('chart-map').onclick=e=>{const r=e.currentTarget.getBoundingClientRect(),x=e.clientX-r.x,y=e.clientY-r.y;let best=null,d=30;for(const port of allDestinations()){const p=e.currentTarget.chartPoint(port.x,port.y),distance=Math.hypot(p.x-x,p.y-y);if(distance<d){best=port;d=distance;}}if(best)selectPort(best.id);};
  $('set-course').onclick=()=>{if(!plan)return;dialogStack.length=0;game.castOff();game.setCourse(plan);$('reach-chart').close();mode='sailing';clear();sailCamera();updateUI();wake();last=accumulator=0;$('reach-water').focus({preventScroll:true});};
  function cameraMenu(open){$('camera-controls').hidden=!open;$('camera-toggle').setAttribute('aria-expanded',String(open));}
  $('camera-toggle').onclick=()=>cameraMenu($('camera-controls').hidden);
  for(const b of document.querySelectorAll('[data-zoom]'))b.onclick=()=>{view.zoomStop(b.dataset.zoom);cameraMenu(false);$('camera-toggle').focus({preventScroll:true});dirty=true;updateUI();};
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.camera-tool'))cameraMenu(false);});
  const water=$('reach-water'),helm=$('reach-helm'),thumb=helm.firstElementChild;
  let stickOrigin=null,stickRadius=38,touchGesture=false,handledButton=null;
  const buttonTouches=new Map();
  function stopStick(){stickId=null;stickOrigin=null;stick.x=stick.y=0;helm.classList.remove('is-active','is-thrusting');thumb.style.transform='';}
  function placeStick(){const r=$('reach').getBoundingClientRect();helm.style.left=(stickOrigin.x-r.left)+'px';helm.style.top=(stickOrigin.y-r.top)+'px';}
  function startStick(e){stickId=e.pointerId;stickOrigin={x:e.clientX,y:e.clientY};stick.x=stick.y=0;helm.classList.add('is-active');stickRadius=(helm.offsetWidth-thumb.offsetWidth)/2;placeStick();wake();}
  function moveStick(e){
    let x=e.clientX-stickOrigin.x,y=e.clientY-stickOrigin.y,d=Math.hypot(x,y);
    // Let the base follow an overextended thumb so reversing never needs a long drag.
    if(d>stickRadius){stickOrigin.x+=x*(1-stickRadius/d);stickOrigin.y+=y*(1-stickRadius/d);x*=stickRadius/d;y*=stickRadius/d;d=stickRadius;placeStick();}
    const dead=6,amount=Math.max(0,(d-dead)/(stickRadius-dead));
    stick.x=d?x/d*amount:0;stick.y=d?y/d*amount:0;
    thumb.style.transform=`translate(${x}px,${y}px)`;helm.classList.toggle('is-thrusting',amount>.1);
  }
  function cameraDrag(from,to){const a=view.screenWorld(from.x,from.y),b=view.screenWorld(to.x,to.y);view.camera.x=game.endgame?view.camera.x+a.x-b.x:E.clamp(view.camera.x+a.x-b.x,E.bounds.left,E.bounds.right);view.camera.y=game.endgame?view.camera.y+a.y-b.y:E.clamp(view.camera.y+a.y-b.y,E.bounds.top,E.bounds.bottom);view.offset.x=view.camera.x-game.player.x;view.offset.y=view.camera.y-game.player.y;view.anchor=null;}
  function beginPinch(){const [a,b]=[...pointers.values()];pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom:view.targetZoom,x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
  water.addEventListener('wheel',e=>{e.preventDefault();if(mode!=='sailing')return;view.setZoom(view.targetZoom*Math.exp(-E.clamp(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?400:1),-200,200)*.0025),e.clientX,e.clientY);updateUI();},{passive:false});
  water.addEventListener('pointerdown',e=>{
    if(mode!=='sailing'||e.pointerType==='mouse'&&e.button!==0)return;
    e.preventDefault();water.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(e.pointerType==='mouse'){if(pointers.size===1)pan={x:e.clientX,y:e.clientY};return;}
    if(pointers.size===1&&!touchGesture)startStick(e);
    else{stopStick();pan=null;touchGesture=true;if(pointers.size===2)beginPinch();}
  });
  water.addEventListener('pointermove',e=>{
    if(mode!=='sailing'||!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(e.pointerId===stickId){moveStick(e);return;}
    if(touchGesture&&pointers.size>=2&&pinch){
      const [a,b]=[...pointers.values()],center={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      cameraDrag(pinch,center);view.setZoom(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance,center.x,center.y);pinch.x=center.x;pinch.y=center.y;
    }else if(pan){cameraDrag(pan,{x:e.clientX,y:e.clientY});pan={x:e.clientX,y:e.clientY};}
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])water.addEventListener(name,e=>{
    if(!pointers.delete(e.pointerId))return;
    if(e.pointerId===stickId)stopStick();
    pan=null;pinch=null;
    if(pointers.size>=2)beginPinch();
    // A remaining pinch finger must lift before it can become the helm again.
    if(!pointers.size)touchGesture=false;
  });
  // A secondary touch does not reliably produce a native click while steering.
  // Own that tap and suppress any subsequent native duplicate until the next press.
  document.addEventListener('pointerdown',e=>{
    handledButton=null;
    const button=e.target.closest('#reach button');
    if(stickId===null||e.pointerType!=='touch'||!button||button.disabled)return;
    e.preventDefault();buttonTouches.set(e.pointerId,{button,x:e.clientX,y:e.clientY,canceled:false});
  },{capture:true,passive:false});
  document.addEventListener('pointermove',e=>{const tap=buttonTouches.get(e.pointerId);if(tap&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>12)tap.canceled=true;},true);
  document.addEventListener('pointerup',e=>{
    const tap=buttonTouches.get(e.pointerId);if(!tap)return;buttonTouches.delete(e.pointerId);handledButton=tap.button;e.preventDefault();
    if(tap.canceled||tap.button.disabled||!tap.button.contains(document.elementFromPoint(e.clientX,e.clientY)))return;
    tap.button.click();
  },{capture:true,passive:false});
  for(const name of ['pointercancel','lostpointercapture'])document.addEventListener(name,e=>buttonTouches.delete(e.pointerId),true);
  document.addEventListener('click',e=>{if(e.isTrusted&&e.detail>0&&handledButton?.contains(e.target)){handledButton=null;e.preventDefault();e.stopImmediatePropagation();}},true);
  function back(){if(!$('camera-controls').hidden){cameraMenu(false);$('camera-toggle').focus({preventScroll:true});return;}const dialog=document.querySelector('dialog[open]');if(dialog)closeDialog(dialog.id);else if(mode==='sailing'||mode==='port')openDialog('reach-menu','menu');}
  controller=new WidewakeController.Controller({settings:()=>settings,using:()=>usingPad,use:()=>usingPad=true,status:()=>{},connected:()=>{},lost:used=>{if(used&&mode==='sailing')openDialog('reach-menu','menu');},context:()=>({sea:mode==='sailing',port:mode==='port',scope:document.querySelector('dialog[open]')||(mode==='title'?$('title-screen'):mode==='port'?$('port-scene'):$('reach'))}),action:action=>{if(action==='back'||action==='pause')back();else if(action==='chart')openChart();else if(action==='context')contextAction();else if(action==='helm')game?.cancel?.();else if(action==='zoom-in'||action==='zoom-out')view.setZoom(view.targetZoom*(action==='zoom-in'?1.3:1/1.3));else if(action==='help')openDialog('help-dialog','menu');else if(mode==='port'&&(action==='next-tab'||action==='previous-tab'))controller.tab($('port-scene'),action==='next-tab'?1:-1);}});
  window.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey||e.altKey||e.target.tagName==='INPUT')return;if(e.code==='Escape'){e.preventDefault();if(!e.repeat)back();return;}if(e.code==='KeyM'&&game&&!e.repeat){e.preventDefault();mode==='chart'?closeDialog('reach-chart'):openChart();return;}if(mode!=='sailing'||e.code==='Space'&&e.target.closest('button,summary'))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(!e.repeat&&e.code==='KeyE')contextAction();if(!e.repeat&&e.code==='KeyH')game.cancel?.();if(['Digit1','Digit2','Digit3'].includes(e.code)){view.zoomStop(['helm','fleet','survey'][Number(e.code.at(-1))-1]);updateUI();}keys.add(e.code);});window.addEventListener('keyup',e=>keys.delete(e.code));$('game').addEventListener('pointerdown',()=>usingPad=false);
  window.addEventListener('resize',()=>{if(stickId!==null||pointers.size)clear();view?.resize();dirty=true;if(mode==='chart')drawChart();});activity.onChange(active=>{last=accumulator=0;if(!active){clear();if(mode==='sailing')openDialog('reach-menu','menu');sound?.suspend();}});window.addEventListener('widewake-activity',e=>{window.dispatchEvent(new Event(e.detail?'focus':'blur'));if(!e.detail){clear();if(mode==='sailing')openDialog('reach-menu','menu');sound?.suspend();}});
  function frame(ms){const raw=last?(ms-last)/1000:1/60,delta=Math.min(.1,raw);last=ms;const pad=controller.update(ms/1000);
    if(mode==='title')front.draw(ms/1000,settings.reduceMotion);
    else if(game&&view){if(mode==='sailing'&&(!view.terrain||view.terrain.cache.has('overview'))&&!view.lost){const input={throttle:E.clamp((keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-stick.y-pad.y,-1,1),steer:E.clamp((keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+stick.x+pad.x,-1,1),boost:keys.has('ShiftLeft')||pad.boost};view.prepareSpawns();accumulator+=delta;let count=0;const stepStart=performance.now();while(accumulator>=1/60&&count<5){game.step(1/60,input);for(const cue of game.sounds){if(!sound)break;const q=view.project(cue.x,cue.y);sound.play(cue.kind==='gun'||cue.kind==='guard'?'escort-shot':cue.kind==='broadside'?'burst':cue.kind==='mortar'?'mortar-shot':cue.kind==='flak'?'flak-shot':cue.kind==='mortar-hit'?'mortar-hit':cue.kind==='repair'?'repair':cue.kind==='hurt'?'hurt':cue.kind==='impact'?'impact':'sink',{pan:E.clamp((q.x/view.width-.5)*1.6,-.8,.8),volume:.3});}accumulator-=1/60;count++;}if(count===5)accumulator=0;stepTimes[samples%600]=performance.now()-stepStart;frameTimes[samples++%600]=raw*1000;sound?.update({mode:'sea',battle:game.raiders.count>0,speed:Math.hypot(game.player.vx,game.player.vy)/game.player.speed,steam:game.player.type!=='launch',work:game.endgame?(game.workActive?'oil':null):game.operation?R.sites.find(s=>s.id===game.operation.id).type:null,paused:false});}
      else if(mode==='port')sound?.update({mode:'port',battle:false,speed:0,paused:false});
      if(mode==='sailing'||dirty||view.terrain&&!view.terrain.ready){view.render(mode==='sailing'?delta:0,mode==='sailing'?accumulator*60:1);dirty=false;}
      if(ms-uiTime>150){updateUI();uiTime=ms;}if(noticeUntil&&ms>noticeUntil){$('reach-notice').textContent='';noticeUntil=0;}
    }activity.requestFrame(frame);
  }
  if(new URLSearchParams(location.search).has('test'))window.__widewakeReach={activity,get game(){return game;},get view(){return view;},get mode(){return mode;},get voyage(){return voyage;},get input(){return{keys:[...keys],stick:{...stick}};},get controller(){return controller;},step:n=>{for(let i=0;i<n;i++)game.step(1/60);dirty=true;updateUI();},metrics:()=>({version:R.version,mode,endgame:!!game?.endgame,...(game?.endgame?game.report():{}),ships:game?.ships.filter(s=>s.hp>0).length,raiders:game?game.raiders.count-game.raiders.dead:0,audioPeak:sound?.stats.peakVoices||0,stepP95:Array.from(stepTimes.subarray(0,Math.min(samples,600))).sort((a,b)=>a-b)[Math.floor(Math.min(samples,600)*.95)]||0,frameP95:Array.from(frameTimes.subarray(0,Math.min(samples,600))).sort((a,b)=>a-b)[Math.floor(Math.min(samples,600)*.95)]||0,...view?.stats})};
  refreshTitle();activity.requestFrame(frame);
})();
