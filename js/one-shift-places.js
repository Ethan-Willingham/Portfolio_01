(function(root){
  'use strict';
  const O=root.OneShift;
  const WORK=['staging','storage','shipping'];
  const names={clock:'Time cards',floor:'Warehouse floor',office:'The office',staging:'Receiving',storage:'Inventory',shipping:'Shipping'};
  const descriptions={office:'Office / Up the stairs',staging:'Receiving / Incoming stock',storage:'Inventory / Rack aisles',shipping:'Shipping / Outbound orders',clock:'Time cards / Clock out and save',purchases:'Purchase orders / Order stock',orders:'Customer orders / Review requests',equipment:'Equipment catalog / Improve the warehouse',ledger:'Ledger / Cash and operating results',floor:'Return to the warehouse floor'};
  class Places{
    constructor(app){
      this.app=app;this.current='clock';this.clockedIn=false;this.started=false;
      const checkpoint=O.saves.load();this.saved=checkpoint&&O.business(checkpoint)?checkpoint:null;this.legacySaved=checkpoint&&!O.business(checkpoint)?checkpoint:null;
      this.element=document.createElement('section');this.element.id='shift-place';this.element.tabIndex=-1;
      this.element.innerHTML='<header class="place-heading"><div><p id="place-kicker">ONE SHIFT</p><h2 id="place-title">Time cards</h2></div><div class="place-utilities"><button id="place-sound" aria-pressed="false">Sound off</button><button id="place-menu">Menu</button></div></header><div class="place-stage"><div class="place-art"><img id="place-image" alt="" draggable="false"><div id="place-targets"></div></div><div id="place-loading" role="status">Opening the building...</div></div><footer class="place-footer"><p id="place-note" role="status"></p><span id="place-load"></span><aside id="place-card" class="place-card" aria-label="Time card"></aside><button id="place-back" hidden>Back to the floor</button></footer>';
      document.getElementById('shift-game').append(this.element);
      this.image=this.el('image');this.image.addEventListener('load',()=>{this.el('loading').hidden=true;this.resize();});
      this.image.addEventListener('error',()=>{this.el('loading').hidden=false;this.el('loading').innerHTML='The artwork could not load. <button data-place="retry">Try again</button>';});
      this.art=new O.PlaceArt({container:this.element.querySelector('.place-art'),image:this.image,targets:this.el('targets'),onChoose:id=>this.choose(id),onHover:(id,label)=>{this.hoverLabel=id==='punch'?label:descriptions[id]||label;this.renderNote();}});
      this.element.addEventListener('click',e=>{e.stopPropagation();const n=e.target.closest('[data-place]');if(n)this.choose(n.dataset.place);});
      this.el('menu').addEventListener('click',()=>app.ui.settingsMenu());
      this.el('sound').addEventListener('click',()=>{const on=this.soundOn();app.ui.settings.volume=on?0:(this.lastVolume||.35);if(on)this.lastVolume=app.audio.volume;app.audio.setVolume(app.ui.settings.volume);O.saves.savePreferences(app.ui.settings);app.audio.unlock();this.update();});
      this.el('back').addEventListener('click',()=>this.go('floor'));
      this.element.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.clockedIn&&this.current!=='floor'){e.preventDefault();this.go('floor');}});
      const nav=app.scenes.element.querySelector('.scene-nav');nav.innerHTML='<button data-place="floor">Back to warehouse floor</button>';nav.querySelector('button').addEventListener('click',()=>this.go('floor'));
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.element.querySelector('.place-stage'));
      app.receiving.close(false);this.go('clock',true);
    }
    el(id){return this.element.querySelector('#place-'+id);}
    soundOn(){return this.app.audio.volume>0&&this.app.audio.context?.state==='running';}
    resize(){const stage=this.element.querySelector('.place-stage'),art=this.element.querySelector('.place-art'),r=stage.getBoundingClientRect();if(!r.width||!r.height)return;const ratio=(this.image.naturalWidth||1536)/(this.image.naturalHeight||1024),w=Math.min(r.width,r.height*ratio);art.style.width=w+'px';art.style.height=w/ratio+'px';this.art?.resize();}
    renderNote(){this.el('note').textContent=this.hoverLabel||this.baseNote||'';}
    choose(id){
      if(this.app.rotated||this.app.hidden||this.app.menuPause)return;
      this.app.audio.unlock();
      if(id==='retry'){this.image.src=this.image.src.split('?')[0]+'?retry='+Date.now();return;}
      if(id==='export-older'){this.exportOlder();return;}
      if(id==='punch'){if(this.clockedIn)this.punchOut();else this.punchIn();return;}
      if(['purchases','orders','equipment','ledger'].includes(id)){this.app.office.open(id);return;}
      this.go(id);
    }
    punchIn(){
      const app=this.app;
      this.clockNotice='';
      if(this.legacySaved){if(!O.saves.save(this.legacySaved,'legacy')){this.clockNotice='The older save could not be backed up. Export it before starting a new game from Menu.';this.update();return;}this.legacySaved=null;}
      if(this.saved){app.sim.restore(this.saved);this.saved=null;app.receiving.attach(false);app.ui.lastPhase=app.sim.s.phase;}
      if(app.sim.s.phase==='evening'){const r=app.sim.command({type:'nextDay'});if(!r.ok){app.ui.toast(r.reason,true);return;}app.ui.lastPhase='shift';}
      this.started=true;this.clockedIn=true;this.app.audio.clockPunch?.();this.go('floor');this.save();
    }
    punchOut(){
      this.clockedIn=false;this.started=true;this.app.scenes.suspend();this.app.audio.clockPunch?.();
      const saved=this.save();this.clockNotice=saved?'Clocked out. Your place is saved.':'Clocked out. Browser storage is unavailable; export your save from Menu.';this.go('clock');
    }
    save(){return !this.app.preview&&O.saves.save(this.app.sim.s);}
    exportOlder(){const state=this.legacySaved||O.saves.load('legacy');if(!state)return;const url=URL.createObjectURL(new Blob([O.saves.encode(state)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='one-shift-older-service-save.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    go(place,initial=false){
      if(!names[place]||!initial&&(this.app.rotated||this.app.hidden))return;
      if(!this.clockedIn&&place!=='clock')return;
      this.app.office?.close();if(this.app.receiving.visible)this.app.receiving.close(false);
      this.app.scenes.suspend();if(!initial&&place!==this.current)this.app.audio.play('door');this.current=place;this.app.audio.setPlace?.(place);
      this.app.placePause=place==='clock'||place==='office';
      this.element.hidden=WORK.includes(place);this.app.scenes.element.hidden=!WORK.includes(place);
      document.body.dataset.place=place;document.body.classList.toggle('shift-in-place',!WORK.includes(place));
      if(WORK.includes(place)){this.app.scenes.open(place);this.app.scenes.element.focus({preventScroll:true});}
      else{
        const file='assets/one-shift/places-v2/'+place+'.webp';
        if(this.image.getAttribute('src')!==file){this.el('loading').hidden=false;this.image.src=file;}
        this.el('title').textContent=names[place];
        const layout=O.placeLayouts[place];
        this.art.setScene({...layout,targets:layout.targets.filter(({id})=>place!=='clock'||id!=='floor'||this.clockedIn)});
        this.el('back').hidden=place!=='office'&&!(place==='clock'&&this.clockedIn);
        this.element.focus({preventScroll:true});this.resize();
      }
      this.app.ui.update();this.update();
    }
    enterWork(place){
      if(!this.clockedIn)return;
      this.app.office?.close();this.current=place;this.app.placePause=false;this.element.hidden=true;this.app.scenes.element.hidden=false;document.body.dataset.place=place;document.body.classList.remove('shift-in-place');this.app.audio.setPlace?.(place);
    }
    restored(){this.saved=null;this.started=true;this.clockedIn=true;this.app.receiving.attach(false);this.app.ui.lastPhase=this.app.sim.s.phase;this.go(this.app.sim.s.phase==='evening'?'clock':'floor');}
    update(){
      const s=this.app.sim.s;if(!O.business(s))return;
      this.el('sound').textContent=this.soundOn()?'Sound on':'Sound off';this.el('sound').setAttribute('aria-pressed',String(this.soundOn()));
      const carry=this.app.sim.p.get(s.commerce.hands.carry);this.el('load').textContent=carry?(this.current==='office'?'Jack outside: ':'On your jack: ')+carry.cases+' '+O.catalog[carry.item].name.toLowerCase()+' cases':'';
      document.getElementById('shift-store').hidden=true;
      if(this.current!=='staging')document.getElementById('shift-receiving-open').hidden=true;
      document.getElementById('shift-queue').hidden=!WORK.includes(this.current)||this.app.officePause;
      if(this.element.hidden)return;
      this.el('kicker').textContent='ONE SHIFT / DAY '+(this.saved?.day||s.day)+' / '+O.time(this.saved?.minute??s.minute)+(this.app.paused?' / PAUSED':'');
      this.el('card').hidden=this.current!=='clock';
      if(this.current==='clock'){
        const state=this.saved||s,verb=this.legacySaved?'Start new warehouse':this.clockedIn?'Clock out':state.phase==='evening'?'Clock in / Day '+(state.day+1):this.saved||this.started?'Clock back in':'Clock in';
        const key=[state.day,Math.floor(state.minute),verb,this.started,this.saved?.day].join('/');
        if(this.cardKey!==key){this.cardKey=key;this.el('card').innerHTML=(this.legacySaved?'<button data-place="export-older">Export older save</button>':'')+'<button data-place="punch">'+verb+'</button>';}
        this.art.setLabel('punch',verb+' at time clock');
        this.baseNote=this.clockNotice||(this.legacySaved?'An older save is here. Starting keeps a backup in Menu.':this.clockedIn?'Punch the clock to save and leave. Your shift waits here.':state.phase==='evening'?'Your shift is closed. Punch in to start tomorrow.':this.saved||this.started?'Punch the clock to continue where you left off.':'Punch the clock. Your first delivery is at Receiving.');
      }else if(this.current==='office')this.baseNote='Choose a document on your desk. The door returns to the floor.';
      else{
        const inbound=s.pallets.filter(p=>p.cases&&(p.receivingDestination||p.place==='trailer'&&this.app.sim.t.get(p.truckId)?.supplier)).length,orders=s.commerce.orders.filter(o=>o.status==='offered').length;
        this.baseNote=inbound?inbound+' incoming pallets at Receiving. Office upstairs. Inventory to the right.':orders?orders+' customer '+(orders===1?'order':'orders')+' at the office desk upstairs.':'Choose a dock, the rack aisle or the office stairs.';
      }
      this.renderNote();
    }
  }
  O.Places=Places;
  // Keep every existing route, including save imports and order shortcuts, inside the building.
  const sceneOpen=O.WarehouseScenes.prototype.open;
  O.WarehouseScenes.prototype.open=function(name){if(WORK.includes(name))this.app.places?.enterWork(name);return sceneOpen.call(this,name);};
  const U=O.UI.prototype,old={update:U.update,openHub:U.openHub,action:U.action,menu:U.settingsMenu};
  U.update=function(){old.update.call(this);this.app.places?.update();this.app.office?.update();};
  U.openHub=function(tab){const p=this.app.places;if(!p)return old.openHub.call(this,tab);if(this.app.sim.s.phase==='evening'&&tab==='reports'){this.lastPhase='evening';p.go('clock');return;}p.go('office');this.app.office.open(({stock:'purchases',shop:'equipment',build:'equipment',reports:'ledger',people:'equipment'})[tab]||'orders');};
  U.saveError=function(message){const note=document.querySelector('#shift-settings .shift-menu-note');if(note){note.textContent=message;note.setAttribute('role','alert');note.scrollIntoView({block:'nearest'});}this.toast(message,true);};
  U.action=function(node){const p=this.app.places,a=node.dataset.action;if(p){if(a==='export-older'){p.exportOlder();return;}if(a==='load'){const state=O.saves.load(Number(node.dataset.id));if(state&&!O.business(state)){this.saveError('This is an older service-mode save. It cannot be loaded into this warehouse.');return;}}if(a==='business-need-stock'||a==='business-tab'&&node.dataset.id==='stock'){p.go('office');this.app.office.open('purchases');return;}if(a==='business-finish'){const s=this.app.sim.s;if(s.commerce.hands.carry||s.commerce.orders.some(o=>o.status==='queued')){this.toast('Finish your accepted orders and set down your pallet first.',true);return;}}}const result=old.action.call(this,node);if(p&&['new','load'].includes(a)){if(a==='new'){p.clockedIn=false;p.saved=null;p.legacySaved=null;p.started=false;p.clockNotice='';p.go('clock');}else p.restored();}if(p&&a==='menu-close'&&!p.element.hidden)p.el('menu').focus({preventScroll:true});return result;};
  U.settingsMenu=function(){old.menu.call(this);const note=document.querySelector('.shift-menu-note');if(note)note.textContent='Punch out at the time clock to save. Clock back in to continue. Named save slots are also available.';if(O.saves.info('legacy'))document.querySelector('.shift-menu-actions')?.insertAdjacentHTML('beforeend','<button data-action="export-older">Export older save</button>');const controls=[...document.querySelectorAll('#shift-settings details p')].find(n=>n.textContent.includes('Select and scan'));if(controls)controls.textContent='Enter each area from the warehouse floor. Desk objects open office paperwork. Select and scan trailer pallets, then unload them. Lift stock onto your jack and choose its rack. Pick each case, stage, hold to wrap, label, call the truck, load and release. Tab and Enter select controls. Space pauses. M opens Menu.';};
})(window);
