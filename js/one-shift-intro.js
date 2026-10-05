(function(root){
 'use strict';const O=root.OneShift;
 // The next lesson is derived from real stock and work, so there is no tutorial save to get stuck.
 O.intro={eligible:s=>s.mode==='normal'&&s.day<=3&&s.contracts.length===1&&s.contracts[0].id==='trail',next(sim){
  const s=sim.s,workers=s.workers,work=workers.flatMap(w=>[w.task,...w.queue]).filter(Boolean),inbound=s.trucks.find(t=>t.direction==='in'&&t.status==='docked'&&!t.departureRequested),outbound=s.trucks.find(t=>t.direction==='out'&&t.status==='docked'&&!t.departureRequested),name=p=>O.items[p.item].name;
  if(s.phase!=='shift')return {kind:'evening',title:'Your warehouse is growing.',text:'Spend your earnings on more storage or faster handling. Adding another client ends the guided shifts.'};
  if(work.length){const task=work[0],p=sim.p.get(task.output||task.pallet);return {kind:'working',pallet:p?.id,task:task.id,title:task.kind==='unload'?(task.dest?.place==='storage'?'Receiving straight into storage.':'Unloading to Receiving.'):task.kind==='putaway'?'Taking it to storage.':task.kind==='load'?'Loading the order.':task.kind==='pick'?'Building the smaller order.':task.kind==='wrap'?'Wrapping and labeling.':'Your worker is on the job.',text:'Watch the worker carry out your plan. The queue below shows the destination. You can plan other jobs too.'};}
  const staged=s.pallets.find(p=>p.place==='lane'&&p.lane==='receiving'&&p.confirmed&&!p.pick&&!p.hold&&!p.reservedBy&&p.cases);
  if(staged&&!s.map.racks.some(r=>[r.x,r.x+1].some(x=>!sim.occupied(x,r.y,0))))return {kind:'capacity',pallet:staged.id,title:'Your racks are full.',text:'Add a rack for two more storage positions. Keep the floor and working aisles clear.',label:'Add storage rack / $55'};
  if(staged)return {kind:'store',pallet:staged.id,title:'Now put it in storage.',text:'Receiving is temporary. Store '+name(staged)+' in a blue rack. Click an empty left or right half, or choose a position below.',label:'Choose storage'};
  if(inbound){const pallets=inbound.manifest.map(id=>sim.p.get(id));if(!inbound.opened)return {kind:'open',truck:inbound.id,title:'Check the delivery seal.',text:'Open the truck paperwork. Match the two seal numbers, then open the trailer. This protects your client\'s goods.',label:'Open truck paperwork'};
   const p=pallets.find(p=>p.place==='trailer'&&!p.reservedBy&&sim.reachable(inbound,p));if(p&&!p.confirmed)return {kind:'count',pallet:p.id,title:'Count '+name(p).toLowerCase()+'.',text:p.condition==='short'?'One case is missing from the top layer. Enter '+p.cases+' in Count, then confirm. The label says '+p.expected+'.':'Each block is one case. '+p.hi+' layers of '+p.ti+' make '+p.cases+' cases. Confirm the count in the pallet panel.',label:'Count this pallet'};
   if(p&&s.pallets.some(q=>q.place==='storage'&&q.receivedDay===s.day)){const slot=s.map.racks.flatMap(r=>[0,1].map(side=>({rack:r.id,x:r.x+side,y:r.y,side}))).find(q=>!sim.occupied(q.x,q.y,0));if(slot)return {kind:'receive-store',pallet:p.id,slot,title:'Receive straight into storage.',text:'You know the full cycle now. This checked pallet can go directly to an empty rack, saving a second trip through Receiving.',label:'Receive into A'+slot.rack+' / '+(slot.side?'right':'left')};}
   if(p)return {kind:'unload',pallet:p.id,title:'Unload the checked pallet.',text:'Take '+name(p)+' off the trailer and into Receiving. Your worker does the walking; your clicks assign the work.',label:'Unload to Receiving'};
  }
  if(outbound){const line=outbound.order.find(l=>sim.remaining(outbound,l)>0);if(!line)return {kind:'dispatch',truck:outbound.id,title:'The order is complete.',text:'Send the truck. The worker steps clear and closes the doors before the driver pulls away.',label:'Send the truck'};
   const left=sim.unassigned(outbound,line),stock=sim.available(line.item,outbound.client),built=stock.find(p=>p.pick&&p.cases<=left),p=built||stock[0];
   if(p){if(p.pick&&!p.wrapped)return {kind:'wrap',pallet:p.id,title:'Secure the smaller load.',text:'The '+p.cases+' picked cases need wrapping and a shipping label before they can leave.',label:'Wrap and label'};
    if(p.cases>left)return {kind:'pick',pallet:p.id,truck:outbound.id,count:Math.min(p.cases,left),title:'This order needs '+left+' cases.',text:'Take only the requested cases from '+name(p)+'. The worker builds a separate pallet; the rest stays in storage.',label:'Pick '+Math.min(p.cases,left)+' cases'};
    return {kind:'load',pallet:p.id,truck:outbound.id,title:'Ship '+name(p).toLowerCase()+'.',text:'The client wants '+left+' cases. This pallet has '+p.cases+'. Load it into the outbound truck at Door '+outbound.door+'.',label:'Load this pallet'};
   }
   const held=s.pallets.find(p=>p.client===outbound.client&&p.item===line.item&&p.hold&&p.cases);return held?{kind:'held',pallet:held.id,title:'This stock is on hold.',text:'Review the held pallet before shipping. Release a mistaken hold, or send the truck short if these goods cannot be used.',label:'Review held pallet'}:{kind:'short',truck:outbound.id,title:'There is no available stock.',text:'This order cannot be filled from the goods here. Send it short to free the door; the report will show the lost fee.',label:'Send short shipment'};
  }
  const active=s.trucks.find(t=>['arriving','yard','leaving'].includes(t.status)||t.status==='docked'&&t.departureRequested);
  if(active)return {kind:'waiting',truck:active.id,title:active.status==='arriving'?(s.day===1&&active.id===s.trucks[0].id?'Your first delivery is arriving.':'Your next truck is arriving.'):'Clearing the dock safely.',text:active.status==='arriving'?(active.direction==='in'?'Receive '+active.manifest.length+' pallets and store them in blue racks. Then fill the pickup order. Wait for the truck to finish backing in.':'Your client is collecting stored goods. Wait for the truck to finish backing in, then load its order.'):'The worker must be off the trailer before its doors close. The clock waits while you learn.'};
  if(s.trucks.some(t=>t.status==='scheduled'))return {kind:'next',title:'Ready for the next appointment.',text:'Your stored goods earn daily storage fees. The next truck brings another delivery or a pickup order.',label:'Bring the next truck'};
  return {kind:'finish',title:'Today\'s trucks are finished.',text:'Close the shift to see the money you earned and choose an upgrade for tomorrow.',label:'Finish shift / see earnings'};
 }};
 if(!O.UI)return;
 const P=O.UI.prototype,el=id=>document.getElementById('shift-'+id),esc=s=>String(s).replace(/[&<>"']/g,q=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[q]));
 P.guideActive=function(){if(this.guideState!==this.app.sim.s){this.guideState=this.app.sim.s;this.guideKey='';}return !this.guideSkipped&&O.intro.eligible(this.app.sim.s);};
 P.renderIntro=function(){const box=el('intro'),s=this.app.sim.s,active=this.guideActive()&&s.phase==='shift'&&!this.app.hubPause;box.hidden=!active;el('queue').classList.toggle('has-guide',active);document.body.classList.toggle('shift-guided',active);if(!active){this.lesson=null;return;}
  const lesson=O.intro.next(this.app.sim);this.lesson=lesson;
  if(lesson.kind==='open'&&this.target?.kind==='truck'&&this.target.id===lesson.truck)lesson.label=this.app.sim.t.get(lesson.truck).seal===this.app.sim.t.get(lesson.truck).expectedSeal?'Check seal and open':'Reject mismatched seal';
  if(lesson.kind==='count'&&this.target?.kind==='pallet'&&this.target.id===lesson.pallet)lesson.label='Confirm count';
  if(lesson.kind==='store'&&this.target?.kind==='putaway'&&this.target.id===lesson.pallet){const q=this.rackPositions(this.app.sim.p.get(lesson.pallet)).find(q=>!q.reason);if(q)lesson.label='Store in A'+q.rack+' / '+(q.side?'right':'left');}const done=s.trucks.filter(t=>t.status==='gone').length,total=s.trucks.length,delivery=s.trucks.find(t=>t.direction==='in'&&!['gone','leaving'].includes(t.status)),stored=delivery?.manifest.filter(id=>['storage','shipped'].includes(this.app.sim.p.get(id).place)).length,progress=delivery&&delivery.status==='docked'?stored+' OF '+delivery.manifest.length+' STORED':done+' OF '+total+' TRUCKS',key=JSON.stringify([lesson,this.app.paused,s.day,progress]);
  if(key!==this.guideKey){this.guideKey=key;const focused=box.contains(document.activeElement),focusAction=document.activeElement?.dataset.action;
   box.innerHTML='<div class="shift-intro-top"><span class="shift-kicker">LEARNING SHIFT '+s.day+' / '+progress+'</span><button data-action="intro-skip" aria-label="Skip the guide and run the clock">Skip guide</button></div><div class="shift-intro-copy"><h2 id="shift-intro-title" role="status">'+esc(lesson.title)+'</h2><p>'+esc(lesson.text)+'</p><small class="shift-intro-clock">'+(this.app.paused?'Paused. Your worker will wait too.':'No rush. The clock waits while you learn.')+'</small></div>'+(this.app.paused?'<button class="primary" data-action="intro-resume">Resume worker</button>':lesson.label?'<button class="primary" data-action="intro-go">'+esc(lesson.label)+'</button>':'');
   if(focused)(box.querySelector('[data-action="'+focusAction+'"]')||box.querySelector('[data-action="intro-go"]')||box.querySelector('button'))?.focus({preventScroll:true});
  }
  el('hint').hidden=true;el('next-truck').hidden=true;
  // Point to the native control as well as the physical object.
  document.querySelectorAll('.shift-next-action').forEach(n=>n.classList.remove('shift-next-action'));
  const selector=({open:'seal',count:'confirm',unload:'stage',store:'rack-spot',wrap:'wrap'})[lesson.kind];if(selector){const button=el('selection').querySelector('[data-action="'+selector+'"]:not(:disabled)');button?.classList.add('shift-next-action');}
 };
 P.drawGuide=function(renderer){const g=renderer.g;g.save();g.strokeStyle='#ea9860';g.lineWidth=2;for(const target of this.guideTargets()){const hit=target.kind==='rack'?{x:target.x,y:target.y,w:1,h:1}:renderer.hits.find(h=>h.kind===target.kind&&h.id===target.id);if(!hit)continue;const q=renderer.screen(hit.x,hit.y),w=Math.max(18,hit.w*renderer.camera.zoom),h=Math.max(18,hit.h*renderer.camera.zoom);g.strokeRect(q.x-5,q.y-5,w+10,h+10);}g.restore();};
 P.guideTargets=function(){const lesson=this.lesson;if(!lesson)return [];const sim=this.app.sim,targets=[],p=sim.p.get(lesson.pallet);if(p&& !['shipped','returned','scrap'].includes(p.place))targets.push({kind:'pallet',id:p.id});if(lesson.truck)targets.push({kind:'truck',id:lesson.truck});if(lesson.kind==='store'||lesson.kind==='receive-store'){const q=lesson.slot||this.rackPositions(p).find(q=>!q.reason);if(q)targets.push({kind:'rack',x:q.x,y:q.y});}return targets;};
 const render=P.renderQueue;P.renderQueue=function(){render.call(this);this.renderIntro();};
 const action=P.action;P.action=function(node){const type=node.dataset.action;if(!type?.startsWith('intro-'))return action.call(this,node);
  if(type==='intro-skip'){this.guideSkipped=true;this.selectionKey='';this.toast('Guide skipped. The clock is running. Restart a fresh game from Menu to learn again.');}
  else if(type==='intro-resume')this.app.paused=false;
  else {const l=O.intro.next(this.app.sim),sim=this.app.sim,s=sim.s;
   if(l.kind==='open'&&this.target?.kind==='truck'&&this.target.id===l.truck)this.issue({type:sim.t.get(l.truck).seal===sim.t.get(l.truck).expectedSeal?'seal':'reject',truck:l.truck});
   else if(['open','held'].includes(l.kind))this.select({kind:l.truck?'truck':'pallet',id:l.truck||l.pallet});
   else if(l.kind==='count'){if(this.target?.kind==='pallet'&&this.target.id===l.pallet)action.call(this,{dataset:{action:'confirm',id:String(l.pallet)}});else {this.select({kind:'pallet',id:l.pallet});el('count')?.focus({preventScroll:true});}}
   else if(l.kind==='store'){if(this.target?.kind==='putaway'&&this.target.id===l.pallet){const q=this.rackPositions(sim.p.get(l.pallet)).find(q=>!q.reason);if(q)this.moveToRack(q.rack,q.side,q.level);}else {this.select({kind:'pallet',id:l.pallet});action.call(this,{dataset:{action:'putaway',id:String(l.pallet)}});}}
   else if(l.kind==='unload')this.issue({type:'move',pallet:l.pallet,dest:{lane:'receiving'}});
   else if(l.kind==='receive-store')this.issue({type:'move',pallet:l.pallet,dest:{x:l.slot.x,y:l.slot.y,level:0}});
   else if(l.kind==='load')this.issue({type:'move',pallet:l.pallet,dest:{truck:l.truck}});
   else if(l.kind==='capacity')this.issue({type:'buy',id:'rack'});
   else if(l.kind==='wrap')this.issue({type:'wrap',pallet:l.pallet});
   else if(l.kind==='pick')action.call(this,{dataset:{action:'pick',id:String(l.pallet)}});
   else if(['dispatch','short'].includes(l.kind))this.issue({type:'dispatch',truck:l.truck});
   else if(l.kind==='next'||l.kind==='finish'){this.target=null;this.selected=[];const until=l.kind==='finish'?s.shiftEnd:Math.min(...s.trucks.filter(t=>t.status==='scheduled').map(t=>t.arrival));while(s.phase==='shift'&&s.minute<until)sim.tick();}
   if(['open','held','count','store'].includes(l.kind)){this.app.renderer.home(s,true);}
  }
  this.update();this.app.renderer.draw(this.app.sim.s,this);
 };
})(typeof window!=='undefined'?window:globalThis);
