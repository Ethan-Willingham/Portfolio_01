(function(root){
 'use strict';const O=root.OneShift,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const button=(text,type,extra='')=>'<button data-hand="'+type+'" '+extra+'>'+text+'</button>';
 const preserve=(node,html)=>{if(node._handsHTML!==html){const focus=node.contains(document.activeElement)?{...document.activeElement.dataset}:null;node._handsHTML=html;node.innerHTML=html;if(focus)[...node.querySelectorAll('button')].find(n=>Object.keys(focus).every(k=>n.dataset[k]===focus[k]))?.focus({preventScroll:true});}};
 function act(app,node){
  if(app.paused||app.rotated||app.hidden||app.menuPause)return;
  const sim=app.sim,type=node.dataset.hand;if(!O.manualHandling(sim.s))return;
  if(type==='scene'){app.scenes.open(node.dataset.sceneName);return;}
  if(type==='wait'){
   const id=Number(node.dataset.truck),t=sim.t.get(id);if(!t)return;
   if(sim.s.trucks.some(q=>q.id!==id&&q.status==='docked'&&!q.departureRequested)&&sim.s.map.doors.length===1){app.ui.toast('Release the truck at the dock first.',true);return;}
   let n=0;while(sim.s.phase==='shift'&&!['docked','gone'].includes(t.status)&&n++<10000)sim.tick();app.ui.update();app.scenes.sync(true);return;
  }
  if(type==='handWrap')return;
  const c={type};for(const k of ['pallet','order','truck'])if(node.dataset[k])c[k]=Number(node.dataset[k]);if(node.dataset.slot!==undefined)c.slot=node.dataset.slot;
  const r=sim.command(c);if(!r.ok)app.ui.toast(r.reason,true);else{app.audio.play(type==='handPickCase'||type==='handLabel'?'scan':'click');if(type==='handBeginPick'){const source=sim.handOrder().allocations.find(a=>!a.collected&&a.output===r.pallet)?.source;app.scenes.open('storage');const p=sim.p.get(source),slot=sim.handRackSlots().find(d=>d.pallet===p?.id);if(slot)app.scenes.page=Math.floor(slot.index/3);}if(type==='handLift'&&!sim.p.get(r.pallet).businessOrder)app.scenes.announce('Pallet on your jack. Go to Storage and choose an empty rack.');}
  app.ui.update();app.scenes.sync(true);app.receiving?.sync();
 }
 const Base=O.WarehouseScenes;
 O.WarehouseScenes=class extends Base{
  constructor(app){super(app);this.initHands();this.sync(true);}
  open(scene){super.open(scene);const sim=this.app.sim;if(!O.manualHandling(sim.s))return;const carry=sim.p.get(sim.s.commerce.hands.carry);let index=null;
   if(scene==='storage'&&carry&&!carry.businessOrder)index=sim.handRackSlots().find(d=>d.available)?.index;
   if(scene==='staging'&&!carry){const p=sim.s.pallets.find(p=>p.place==='lane'&&p.lane==='receiving');if(p)index=sim.handFloorSlots('receiving').find(d=>d.x===p.x&&d.y===p.y)?.index;}
   if(index!==null&&index!==undefined){this.page=Math.floor(index/3);this.sync(true);}
  }
  initHands(){
   if(this.handLayer)return;this.handLayer=document.createElement('div');this.handLayer.className='hands-zones';this.stage.append(this.handLayer);
   this.handActions=document.createElement('div');this.handActions.className='hands-actions';this.el('label').querySelector('dl').before(this.handActions);
   this.handTools=document.createElement('div');this.handTools.className='hands-tools';this.stage.append(this.handTools);
   this.carryStrip=document.createElement('div');this.carryStrip.className='hands-carry';this.carryStrip.hidden=true;this.element.querySelector('.scene-nav').before(this.carryStrip);
   this.element.addEventListener('click',e=>{const n=e.target.closest('[data-hand]');if(n)act(this.app,n);});
   this.element.addEventListener('click',e=>{if(this.suppressWrapClick&&e.target.closest('[data-hand]')){this.suppressWrapClick=false;e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
   this.element.addEventListener('pointerdown',e=>{this.suppressWrapClick=false;this.finishedWrapGesture=false;const n=e.target.closest('[data-hand="handWrap"]');if(n){e.preventDefault();n.setPointerCapture(e.pointerId);this.beginWrap(n);}});
   this.element.addEventListener('pointerup',()=>this.finishWrapGesture());this.element.addEventListener('pointercancel',()=>this.finishWrapGesture());
   this.element.addEventListener('keydown',e=>{if(!e.repeat&&[' ','Enter'].includes(e.key)){this.suppressWrapClick=false;this.finishedWrapGesture=false;}if(e.target.matches('[data-hand="handWrap"]')&&[' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)this.beginWrap(e.target);}});
   this.element.addEventListener('keyup',e=>{if((this.finishedWrapGesture||e.target.matches('[data-hand="handWrap"]'))&&[' ','Enter'].includes(e.key)){e.preventDefault();this.finishWrapGesture();}});
  }
  beginWrap(node){if(this.app.paused||this.blocked())return;this.finishedWrapGesture=false;this.wrapping={id:Number(node.dataset.pallet),time:0,duration:this.app.sim.s.owned.wrapper? .55:this.app.sim.s.owned.wrapStand?1:1.2,node};node.textContent='Keep holding to wrap';node.style.setProperty('--wrap-progress','0%');}
  finishWrapGesture(){if(this.finishedWrapGesture){this.suppressWrapClick=true;this.finishedWrapGesture=false;}this.endWrap();}
  endWrap(){if(!this.wrapping)return;this.wrapping.node.textContent='Hold to wrap pallet';this.wrapping.node.style.removeProperty('--wrap-progress');this.wrapping=null;}
  advance(dt){super.advance(dt);const w=this.wrapping;if(!w)return;if(this.blocked()||this.app.paused){this.endWrap();return;}w.time+=dt;w.node.style.setProperty('--wrap-progress',Math.min(100,w.time/w.duration*100)+'%');if(w.time>=w.duration){this.wrapping=null;this.finishedWrapGesture=true;const r=this.app.sim.command({type:'handWrap',pallet:w.id});if(!r.ok)this.app.ui.toast(r.reason,true);this.app.ui.update();this.sync(true);}}
  suspend(){this.endWrap();super.suspend();}
  sync(force){super.sync(force);if(this.handLayer)this.updateHands();}
  resize(){super.resize();if(this.handLayer)this.updateHands();}
  updatePanel(){super.updatePanel();if(this.handLayer)this.updateHands();}
  updateHands(){
   const sim=this.app.sim,s=sim.s,manual=O.manualHandling(s);document.body.classList.toggle('shift-manual',manual);if(!manual)return;
   const h=s.commerce.hands,carry=sim.p.get(h.carry),p=sim.p.get(this.selected),order=sim.handOrder(),disabled=this.app.paused?'disabled':'';
   const payload=carry?{id:carry.id,cases:carry.cases,item:carry.item,wrapped:carry.wrapped}:null;
   let actions='';
   if(p?.place==='lane'){
    if(!p.businessOrder||p.wrapped&&p.labelled)actions=button('Lift pallet onto jack','handLift','data-pallet="'+p.id+'" '+(carry?'disabled':disabled));
    else actions=button(!p.wrapped?'Hold to wrap pallet':'Apply shipping label',!p.wrapped?'handWrap':'handLabel','data-pallet="'+p.id+'" '+disabled);
   }
   if(p?.place==='storage'&&carry?.businessOrder&&p.item===carry.item){const a=order?.allocations.find(a=>a.source===p.id&&a.output===carry.id&&!a.collected);if(a)actions='<p>'+a.count+' cases left at this pallet.</p>'+button('Pick one case','handPickCase','data-pallet="'+p.id+'" '+disabled);}
   preserve(this.handActions,actions);
   this.carryStrip.hidden=!carry;
   if(carry){preserve(this.carryStrip,'<canvas class="hands-cargo" width="100" height="90" aria-hidden="true"></canvas><div><span>ON YOUR PALLET JACK</span><strong>'+(carry.cases?carry.cases+' '+esc(O.catalog[carry.item].name.toLowerCase())+' cases':'Empty shipping pallet')+'</strong></div>'+(h.origin&&!carry.businessOrder?button('Set back down','handSetBack',disabled):'<p>'+esc(carry.businessOrder?(carry.wrapped&&carry.labelled?'Load into the customer trailer.':'Set down in Shipping after finishing the pick.'):'Choose an empty rack in Storage.')+'</p>'));const canvas=this.carryStrip.querySelector('canvas'),asset=this.images.get(['pallet-cargo.png','pallet-mixed.png','pallet-low.png','pallet-tall.png'][O.palletArtIndex(carry)]);if(asset?.bounds){const b=asset.bounds,g=canvas.getContext('2d'),crop=carry.cases?b:{x:b.x,y:b.y+b.h*.91,w:b.w,h:b.h*.09},scale=Math.min(94/crop.w,84/crop.h);g.clearRect(0,0,100,90);g.drawImage(asset.image,crop.x,crop.y,crop.w,crop.h,(100-crop.w*scale)/2,90-crop.h*scale,crop.w*scale,crop.h*scale);}}
   let tools='';
   if(this.scene==='storage'&&order&&!carry&&order.allocations.some(a=>!a.collected))tools=button(order.allocations.some(a=>!a.collected&&a.output)?'Continue picked pallet':'Take empty pallet','handBeginPick','data-order="'+order.id+'" '+disabled);
   if(this.scene==='staging')for(const t of s.trucks.filter(t=>t.supplier&&t.status==='docked'&&!t.departureRequested&&!t.manifest.some(id=>sim.p.get(id).place==='trailer')))tools+=button('Release empty trailer','handReleaseSupplier','data-truck="'+t.id+'" '+disabled);
   if(this.scene==='staging'&&!carry)for(const t of s.trucks.filter(t=>t.supplier&&['scheduled','arriving','yard'].includes(t.status)))tools+=button('Wait for delivery','wait','data-truck="'+t.id+'" '+disabled);
   if(this.scene==='shipping'&&order){const outputs=[...new Set(order.allocations.map(a=>a.output))].map(id=>sim.p.get(id)),t=sim.t.get(order.truck);
    if(!t&&outputs.length&&outputs.every(p=>p?.place==='lane'&&p.wrapped&&p.labelled)&&order.allocations.every(a=>a.collected))tools+=button('Call customer truck','handCallTruck','data-order="'+order.id+'" '+disabled);
    if(t&&['scheduled','arriving','yard'].includes(t.status))tools+=button('Wait for customer truck','wait','data-truck="'+t.id+'" '+disabled);
    if(t?.status==='docked'&&!t.departureRequested&&t.order.every(l=>!sim.remaining(t,l)))tools+=button('Release loaded truck','handDispatch','data-truck="'+t.id+'" '+disabled);
   }
   preserve(this.handTools,tools);this.handTools.hidden=!tools;
   let zones='';
   if(carry&&!carry.businessOrder&&this.scene==='storage')for(const d of sim.handRackSlots().filter(d=>d.available&&Math.floor(d.index/3)===this.page))zones+=this.zone(d.index%3,button('Set in '+d.name,'handStore','data-slot="'+d.id+'" '+disabled),'rack');
   if(carry?.businessOrder&&this.scene==='shipping'&&!carry.wrapped)for(const d of sim.handFloorSlots('shipping').filter(d=>d.available&&Math.floor(d.index/3)===this.page))zones+=this.zone(d.index%3,button('Set down here','handStage','data-slot="'+d.id+'" '+disabled),'floor');
   const t=carry?.businessOrder&&sim.t.get(s.commerce.orders.find(o=>o.id===carry.businessOrder)?.truck);
   if(this.scene==='shipping'&&carry?.wrapped&&carry.labelled&&t?.status==='docked')zones+='<div class="hands-door" style="left:'+((this.ox+593*this.scale)/this.w*100)+'%;top:'+((this.oy+58*this.scale)/this.h*100)+'%;width:'+(382*this.scale)+'px;height:'+(462*this.scale)+'px">'+button('Load onto truck','handLoad','data-truck="'+t.id+'" '+disabled)+'</div>';
   preserve(this.handLayer,zones);
   // Include carried stock in the UI update key without making it appear on a floor.
   this.element.dataset.carry=payload?String(payload.id):'';
  }
  zone(index,html,kind){const anchors=this.scene==='storage'?[[350,690],[770,690],[1180,690]]:[[275,752],[760,752],[1265,752]],a=anchors[index],width=Math.max(70,290*this.scale),height=Math.max(44,110*this.scale),left=this.ox+a[0]*this.scale-width/2,top=this.oy+a[1]*this.scale-height;return '<div class="hands-position '+kind+'" style="left:'+left+'px;top:'+top+'px;width:'+width+'px;min-height:'+height+'px">'+html+'</div>';}
 };
 document.addEventListener('click',e=>{const n=e.target.closest('#shift-queue [data-hand]');if(n)act(O.app,n);});
 const U=O.UI.prototype,old={queue:U.renderQueue,action:U.action,hub:U.renderHub,menu:U.settingsMenu};
 U.renderQueue=function(){const app=this.app,sim=app.sim,s=sim.s;if(!O.manualHandling(s))return old.queue.call(this);
  const panel=document.getElementById('shift-queue'),body=document.getElementById('shift-queue-body');panel.hidden=app.hubPause;this.queueLayout();document.getElementById('shift-intro').hidden=true;panel.querySelector('strong').textContent='Your work';document.getElementById('shift-queue-summary').textContent='';
  const h=s.commerce.hands,carry=sim.p.get(h.carry),inbound=s.pallets.filter(p=>p.cases&&(p.receivingDestination||p.place==='trailer'&&sim.t.get(p.truckId)?.supplier)),tab=this.businessTab||'orders';let html='';
  if(inbound.length){const trailer=inbound.some(p=>p.place==='trailer'),floor=inbound.some(p=>p.place==='lane');html+='<article class="shift-opening-card"><p class="shift-kicker">Receiving</p><h2>'+inbound.length+' pallets to rack</h2><p class="shift-opening-copy">'+(carry?'Take your pallet to Storage. Choose an empty rack.':trailer?'Select a trailer pallet. Scan its label, then unload it.':'Select a floor pallet and lift it onto your jack.')+'</p>'+(trailer?'<button data-action="business-receiving" class="primary">Open trailer</button>':button(carry?'Go to Storage':'Go to Receiving','scene','data-scene-name="'+(carry?'storage':'staging')+'"'))+'</article>';}
  for(const t of s.trucks.filter(t=>t.supplier&&t.status==='docked'&&!t.departureRequested&&!t.manifest.some(id=>sim.p.get(id).place==='trailer')))html+='<section class="hands-release"><p>The supplier trailer is empty.</p>'+button('Release empty trailer','handReleaseSupplier','data-truck="'+t.id+'"')+'</section>';
  const first=!s.commerce.completed;
  if(!first)html+='<nav class="shift-business-tabs">'+['orders','stock'].map(id=>'<button data-action="business-tab" data-id="'+id+'" aria-pressed="'+(tab===id)+'">'+(id==='orders'?'Orders':'Stock')+'</button>').join('')+'</nav>';
  if(tab==='stock'&&!first)html+=this.businessStockHTML();else for(const o of s.commerce.orders.filter(o=>['offered','queued'].includes(o.status))){
   if(first&&inbound.length)break;
   const total=o.lines.reduce((n,l)=>n+l.cases,0),collected=o.allocations.reduce((n,a)=>n+(a.collected?a.count:0),0),t=sim.t.get(o.truck),ready=o.lines.every(l=>sim.businessStock(l.item).free>=l.cases);
   html+='<article class="shift-order-card" data-order="'+o.id+'"><header><strong>'+esc(o.customer)+'</strong><span>'+O.price(o.lines.reduce((n,l)=>n+l.cases*l.price,0))+'</span></header><div class="shift-order-lines">'+o.lines.map(l=>'<span><b>'+l.cases+'</b> '+O.catalog[l.item].name+'</span>').join('')+'</div>';
   if(o.status==='offered')html+=ready?'<p>Pick, wrap and load this order yourself.</p><button class="primary" data-action="business-fulfill" data-id="'+o.id+'">Start order</button>':'<p>Receive and put away the required stock first.</p>';
   else{html+='<p class="hands-pick-count">'+collected+' / '+total+' cases picked</p>';
    if(collected<total)html+=button(carry?'Continue picking':'Go to Storage','scene','data-scene-name="storage"');else html+=button(t?.loaded.length?'Review loaded truck':'Go to Shipping','scene','data-scene-name="shipping"');
    html+='<button data-action="business-cancel" data-id="'+o.id+'" '+(t?.loaded.length?'disabled':'')+'>Cancel order</button>';
   }html+='</article>';if(first)break;
  }
  if(!inbound.length&&!s.commerce.orders.some(o=>['offered','queued'].includes(o.status))){const future=s.commerce.orders.find(o=>o.status==='future');html+='<p>'+(future?'Next order at '+O.time(future.arrival)+'.':'No more orders today.')+'</p><button class="primary" data-action="business-'+(future?'advance':'finish')+'">'+(future?'Wait for next order':'Finish shift')+'</button>';}
  if(s.commerce.completed===1&&!s.commerce.restocked)html+='<div class="shift-first-receipt"><strong>First order paid.</strong><button data-action="business-need-stock" data-item="lantern">Buy more stock</button></div>';
  preserve(body,html);
 };
 U.action=function(node){const result=old.action.call(this,node);if(node.dataset.action==='new'&&O.business(this.app.sim.s)){this.app.sim.setManualHandling();this.app.scenes.sync(true);this.app.receiving.sync();}return result;};
 U.renderHub=function(){old.hub.call(this);if(!O.manualHandling(this.app.sim.s))return;
  if(this.app.sim.s.workers.length===1)document.querySelector('#shift-hub nav [data-hub="people"]')?.remove();
  for(const n of document.querySelectorAll('#shift-hub [data-action="hire"]'))n.closest('article')?.remove();
  for(const id of ['cart','walkie'])document.querySelector('#shift-hub [data-equipment="'+id+'"]')?.remove();
  const lift=document.querySelector('#shift-hub [data-equipment="usedLift"] p');if(lift)lift.textContent='Access upper rack positions';const stand=document.querySelector('#shift-hub [data-equipment="wrapStand"] p');if(stand)stand.textContent='Shorter wrapping hold. Unlocks the wrapper.';
 };
 U.settingsMenu=function(){old.menu.call(this);if(O.manualHandling(this.app.sim.s)){const p=[...document.querySelectorAll('#shift-settings p')].find(p=>p.textContent.includes('Choose a floor scene'));if(p)p.textContent='Select and scan a trailer pallet, then unload it. Lift floor stock onto your jack and choose an empty rack. Start an order, take an empty pallet and pick each case. Set down in Shipping, hold to wrap, apply the label, call the truck, lift and load the pallet, then release the truck. Tab and Enter select controls. Space pauses. M opens Menu.';}};
})(window);
