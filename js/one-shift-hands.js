(function(root){
 'use strict';const O=root.OneShift,P=O.Sim.prototype;
 const old={assign:P.assign,work:P.work,command:P.command,restore:P.restore,depart:P.depart,requestTruckExit:P.requestTruckExit,cancel:P.cancelBusinessOrder,nextDay:P.nextDay,tick:P.tick};
 const fail=reason=>({ok:false,reason}),ok=extra=>({ok:true,...extra});
 O.manualHandling=s=>O.business(s)&&s.commerce.manualHandling===true;
 const event=(s,text)=>{s.events.push({kind:'hands',text,tick:s.tick});if(s.events.length>80)s.events.shift();};
 const position=p=>({x:p.x,y:p.y,level:p.level,place:p.place,lane:p.lane||null,rack:p.rack||null});
 P.setManualHandling=function(){
  const s=this.s;if(!O.business(s))return false;
  if(s.commerce.manualHandling)return true;
  s.commerce.manualHandling=true;s.commerce.hands={carry:null,origin:null,order:null};
  // Recover existing saved work at its actual stock quantity. No work continues by itself.
  for(const w of s.workers){
   for(const t of [w.task,...w.queue].filter(Boolean))this.release(t);
   w.task=null;w.queue=[];Object.assign(w,O.docks.spawn(s));
  }
  for(const p of s.pallets){p.reservedBy=null;if(p.place==='transit'){
   const dest=this.lane(p.businessOrder?'shipping':'receiving',p);
   if(dest?.place==='lane')Object.assign(p,dest);
   else if(!s.commerce.hands.carry){s.commerce.hands.carry=p.id;s.commerce.hands.origin=null;}
   else throw Error('Set down carried stock before converting this save.');
  }}
  this.occTick=-1;return true;
 };
 P.restore=function(state){old.restore.call(this,state);if(O.business(this.s))this.setManualHandling();};
 P.assign=function(){if(!O.manualHandling(this.s))return old.assign.call(this);this.businessArrivals();};
 P.work=function(w){if(!O.manualHandling(this.s))return old.work.call(this,w);};
 P.requestTruckExit=function(t){if(O.manualHandling(this.s)&&!this.handRelease)return;return old.requestTruckExit.call(this,t);};
 P.depart=function(t){if(O.manualHandling(this.s)&&!this.handRelease)return;return old.depart.call(this,t);};
 P.cancelBusinessOrder=function(o,status){if(O.manualHandling(this.s)&&status==='missed'&&o.status==='queued')return;const result=old.cancel.call(this,o,status);if(O.manualHandling(this.s)){
  const h=this.s.commerce.hands,p=this.p.get(h.carry);if(p&&!p.cases){if(p.place!=='empty'){p.place='empty';this.s.emptyPallets++;}h.carry=null;h.origin=null;}if(h.order===o.id)h.order=null;
 }return result;};
 P.tick=function(advanceClock=true){const s=this.s;if(O.manualHandling(s)&&(s.commerce.hands.carry||s.commerce.orders.some(o=>o.status==='queued'))&&s.minute+O.DT*O.CLOCK>=s.shiftEnd-.2)advanceClock=false;return old.tick.call(this,advanceClock);};
 P.nextDay=function(){old.nextDay.call(this);if(O.manualHandling(this.s))this.s.commerce.hands.order=null;};
 P.handRackSlots=function(){
  const s=this.s,h=s.commerce.hands,carry=this.p.get(h.carry),slots=[];
  for(const r of s.map.racks.slice().sort((a,b)=>a.id-b.id))for(let level=0;level<r.levels;level++)for(let side=0;side<2;side++){
   const d={x:r.x+side,y:r.y,level,place:'storage',rack:r.id},p=s.pallets.find(p=>p.cases&&p.place==='storage'&&p.x===d.x&&p.y===d.y&&p.level===level),locked=level>0&&(!O.has(s,'forklift')||!s.owned.training);
   slots.push({...d,index:slots.length,id:r.id+'-'+level+'-'+side,name:'Rack '+r.id+' / '+(side?'right':'left')+(level?' / level '+(level+1):''),pallet:p?.id||null,available:!p&&!locked&&(!!carry?.receivingDestination||!this.occupied(d.x,d.y,level,carry?.id)),locked});
  }return slots;
 };
 P.handOrder=function(){const h=this.s.commerce.hands;return this.s.commerce.orders.find(o=>o.id===h.order&&o.status==='queued')||this.s.commerce.orders.find(o=>o.status==='queued')||null;};
 P.handFloorSlots=function(kind){const r=O.docks.lane(this.s,kind),slots=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)slots.push({x,y,level:0,place:'lane',lane:kind,index:slots.length,id:String(slots.length),available:!this.occupied(x,y,0,this.s.commerce.hands.carry)});return slots;};
 P.handInstruction=function(scene){
  const s=this.s,h=s.commerce.hands,p=this.p.get(h.carry),o=this.handOrder();
  if(p){if(p.businessOrder){if(p.wrapped&&p.labelled)return 'Load your pallet into the customer trailer.';const left=o?.allocations.filter(a=>a.output===p.id&&!a.collected).reduce((n,a)=>n+a.count,0)||0;return left?'Pick '+left+' more '+O.catalog[p.item].name.toLowerCase()+' cases.':'Take this pallet to Shipping and set it down.';}return 'Carrying '+p.cases+' '+O.catalog[p.item].name.toLowerCase()+' cases. Choose an empty rack position.';}
  if(scene==='staging')return s.pallets.some(p=>p.place==='lane'&&p.lane==='receiving')?'Select a pallet, then lift it onto your pallet jack.':'Open the trailer to scan and unload its pallets.';
  if(scene==='storage')return o?'Take an empty pallet, then pick the order cases from a rack.':'Select an order to start picking, or bring stock here to put away.';
  return 'Set down, wrap, label and load each order pallet. Release the truck when it is ready.';
 };
 P.handAction=function(c){
  const s=this.s,h=s.commerce.hands,p=this.p.get(c.pallet),carry=this.p.get(h.carry),o=s.commerce.orders.find(o=>o.id===c.order)||this.handOrder();
  if(s.phase!=='shift')return fail('Start the next shift to handle stock.');
  if(c.type==='handUnload'){
   if(carry)return fail('Set your current pallet down before unloading another.');
   const t=p&&this.t.get(p.truckId);if(!p||p.place!=='trailer'||!t?.supplier||t.status!=='docked'||t.departureRequested||!this.receivingAccepted(p.id))return fail('Scan a docked pallet before unloading it.');
   if(t.manifest.some(id=>{const q=this.p.get(id);return q.place==='trailer'&&Math.floor(q.index/2)<Math.floor(p.index/2);}))return fail('Unload the front row first.');
   const dest=this.handFloorSlots('receiving').find(d=>d.available);if(!dest)return fail('Put a receiving pallet away to make room.');
   Object.assign(p,{x:dest.x,y:dest.y,level:0,place:'lane',lane:'receiving',truckId:null,reservedBy:null});this.occTick=-1;event(s,'You unloaded '+p.cases+' cases into Receiving.');return ok({pallet:p.id});
  }
  if(c.type==='handLift'){
   if(carry)return fail('Set down the pallet already on your jack.');
   if(!p||p.place!=='lane'||p.hold||!p.cases)return fail('Choose a staged pallet.');
   if(p.businessOrder&&(!p.wrapped||!p.labelled))return fail('Wrap and label this pallet before lifting it to load.');
   h.carry=p.id;h.origin=position(p);Object.assign(p,{place:'transit',level:0});this.occTick=-1;event(s,'Pallet on your jack. Choose where to set it down.');return ok({pallet:p.id});
  }
  if(c.type==='handStore'){
   if(!carry||carry.businessOrder)return fail('Bring a stock pallet to an empty rack.');
   const d=this.handRackSlots().find(d=>d.id===c.slot);if(!d?.available)return fail('Choose an available rack position.');
   const dest={x:d.x,y:d.y,level:d.level,place:'storage',rack:d.rack};
   const displaced=s.pallets.find(p=>p.id!==carry.id&&p.receivingDestination&&p.receivingDestination.x===d.x&&p.receivingDestination.y===d.y&&p.receivingDestination.level===d.level);
   if(displaced){const previous={...carry.receivingDestination};displaced.receivingDestination=previous;for(const t of s.trucks)for(const r of t.receipt||[])if(r.pallet===displaced.id&&r.manual)r.destination={...previous};}
   Object.assign(carry,dest,{lane:null,truckId:null});delete carry.receivingDestination;
   for(const t of s.trucks)for(const r of t.receipt||[])if(r.pallet===carry.id&&r.manual)r.destination={...dest};
   const purchase=s.commerce.purchases.find(q=>q.pallets.includes(carry.id));if(purchase&&!purchase.received.includes(carry.id))purchase.received.push(carry.id);
   h.carry=null;h.origin=null;this.occTick=-1;this.businessArrivals();event(s,'You put '+carry.cases+' cases in '+d.name+'.');return ok({pallet:carry.id});
  }
  if(c.type==='handBeginPick'){
   if(carry)return fail('Set down your current pallet first.');
   if(!o||o.status!=='queued')return fail('Choose an active order.');
   const a=o.allocations.find(a=>!a.collected&&(!c.item||this.p.get(a.source).item===c.item));if(!a)return fail('All cases for this order are already picked.');
   const source=this.p.get(a.source),alloc=o.allocations.filter(a=>this.p.get(a.source).item===source.item);
   const existing=this.p.get(alloc.find(a=>a.output)?.output);
   if(existing){if(existing.place!=='lane'||existing.wrapped)return fail('Finish the existing pallet for this product.');h.carry=existing.id;h.origin=null;h.order=o.id;existing.place='transit';this.occTick=-1;return ok({pallet:existing.id});}
   const dest=this.lane('shipping');if(dest?.place!=='lane')return fail('Clear a Shipping position first.');
   if(s.emptyPallets<1){if(!O.spend(s,'Packaging',2,'Shipping pallet'))return fail('Need $2 for an empty pallet.');s.emptyPallets++;}s.emptyPallets--;
   const output=this.pallet(source.item,'trail',0,null,{...O.docks.stack(s),place:'transit',confirmed:true,scanned:true,pick:true,wrapped:false,labelled:false,businessOrder:o.id,unitCost:source.unitCost,costBasis:0,lot:source.lot,receivedDay:source.receivedDay,bestBy:source.bestBy});
   for(const a of alloc)a.output=output.id;h.carry=output.id;h.origin=null;h.order=o.id;this.occTick=-1;event(s,'Empty pallet ready. Pick '+O.catalog[source.item].name.toLowerCase()+' from the racks.');return ok({pallet:output.id});
  }
  if(c.type==='handPickCase'){
   if(!carry?.businessOrder||!o||o.id!==carry.businessOrder||!p||p.place!=='storage'||p.hold||p.item!==carry.item)return fail('Pick the required product from its source rack.');
   if(p.level>0&&(!O.has(s,'forklift')||!s.owned.training))return fail('Forklift ownership and training are required for upper stock.');
   const a=o.allocations.find(a=>a.source===p.id&&a.output===carry.id&&!a.collected);if(!a||p.cases<1)return fail('This pallet has no remaining cases for your order.');
   const picked=a.handPicked||0;if(picked>=a.count)return fail('The required cases have already been picked.');
   const cost=p.cases===1?p.costBasis:Math.round(p.costBasis/p.cases);
   p.cases--;p.bookCases=p.cases;p.costBasis-=cost;carry.cases++;carry.bookCases=carry.cases;carry.costBasis+=cost;carry.unitCost=Math.round(carry.costBasis/carry.cases);
   carry.receivedDay=Math.min(carry.receivedDay,p.receivedDay);carry.bestBy=Math.min(carry.bestBy,p.bestBy);if(carry.lot!==p.lot)carry.lot='MIXED';
   // Split each handled case into a collected allocation so existing claims and save checks remain exact.
   a.count--;if(!a.count){a.count=1;a.collected=true;}else o.allocations.push({source:p.id,count:1,output:carry.id,collected:true,unitCost:a.unitCost});
   if(!p.cases){p.place='empty';s.emptyPallets++;}this.occTick=-1;event(s,'Picked '+carry.cases+' cases onto this pallet.');return ok({pallet:carry.id,cases:carry.cases});
  }
  if(c.type==='handStage'){
   if(!carry?.businessOrder)return fail('Bring a picked order pallet to Shipping.');
   const order=s.commerce.orders.find(o=>o.id===carry.businessOrder);if(order.allocations.some(a=>a.output===carry.id&&!a.collected))return fail('Pick the remaining cases before staging this pallet.');
   const slots=this.handFloorSlots('shipping'),dest=c.slot!==undefined?slots.find(d=>d.id===String(c.slot)&&d.available):slots.find(d=>d.available);if(!dest)return fail('Choose an empty Shipping position.');Object.assign(carry,{x:dest.x,y:dest.y,level:0,place:'lane',lane:'shipping',wrapped:false,labelled:false});h.carry=null;h.origin=null;this.occTick=-1;event(s,'You set the picked pallet in Shipping.');return ok({pallet:carry.id});
  }
  if(c.type==='handWrap'||c.type==='handLabel'){
   if(!p?.businessOrder||p.place!=='lane'||p.lane!=='shipping'||!p.cases)return fail('Set an order pallet down in Shipping.');
   if(c.type==='handWrap'){if(p.wrapped)return fail('This pallet is already wrapped.');p.wrapped=true;O.post(s,'Wrap and labels',2.5,'Shipping materials');event(s,'You secured the load with stretch wrap.');}
   else{if(!p.wrapped)return fail('Wrap the pallet first.');if(p.labelled)return fail('This pallet is already labelled.');p.labelled=true;event(s,'Shipping label applied.');}return ok({pallet:p.id});
  }
  if(c.type==='handCallTruck'){
   if(!o||o.status!=='queued'||o.truck)return fail('Choose a prepared order without a truck.');
   const outputs=[...new Set(o.allocations.map(a=>a.output))].map(id=>this.p.get(id));
   if(o.allocations.some(a=>!a.collected)||outputs.some(p=>!p||p.place!=='lane'||!p.wrapped||!p.labelled))return fail('Pick, stage, wrap and label every order pallet first.');
   const t=this.truck('out','trail',s.minute,[],o.lines.map(l=>({item:l.item,cases:l.cases,full:false})),{deadline:o.due,freeMinutes:10000,businessOrder:o.id});o.truck=t.id;event(s,'You called the customer truck.');return ok({truck:t.id});
  }
  if(c.type==='handLoad'){
   if(!carry?.businessOrder||!carry.wrapped||!carry.labelled)return fail('Lift a wrapped and labelled order pallet first.');
   const order=s.commerce.orders.find(o=>o.id===carry.businessOrder),t=this.t.get(order?.truck);if(!t||t.status!=='docked'||t.departureRequested||c.truck&&c.truck!==t.id)return fail('Wait for the correct customer truck to dock.');
   if(!t.order.some(l=>l.item===carry.item&&this.remaining(t,l)>=carry.cases))return fail('This pallet does not match the truck order.');
   carry.place='shipped';carry.truckId=t.id;t.loaded.push({pallet:carry.id,item:carry.item,client:carry.client,cases:carry.cases,scanned:true});s.goods.shipped+=carry.cases;s.dayShipped+=carry.cases;s.records.pallets++;s.records.cases+=carry.cases;h.carry=null;h.origin=null;this.occTick=-1;event(s,'You loaded the pallet. Release the truck when its order is complete.');return ok({pallet:carry.id});
  }
  if(c.type==='handDispatch'||c.type==='handReleaseSupplier'){
   const t=this.t.get(c.truck||o?.truck);if(!t||t.status!=='docked'||t.departureRequested)return fail('Choose a docked truck.');
   if(c.type==='handDispatch'&&(t.direction!=='out'||!t.businessOrder||t.order.some(l=>this.remaining(t,l))))return fail('Load the complete customer order before releasing its truck.');
   if(c.type==='handReleaseSupplier'&&(!t.supplier||t.manifest.some(id=>this.p.get(id).place==='trailer')))return fail('Unload every pallet before releasing the supplier.');
   this.handRelease=true;try{if(t.direction==='out')this.depart(t);else this.requestTruckExit(t);}finally{this.handRelease=false;}event(s,'You released the truck.');return ok({truck:t.id});
  }
  if(c.type==='handSetBack'){
   if(!carry||!h.origin||carry.businessOrder)return fail('Choose a rack or finish handling this pallet.');Object.assign(carry,h.origin);h.carry=null;h.origin=null;this.occTick=-1;return ok();
  }
  return fail('Choose a handling action.');
 };
 P.command=function(c){
  if(!O.manualHandling(this.s))return old.command.call(this,c);
  if(typeof c?.type==='string'&&c.type.startsWith('hand'))return this.handAction(c);
  if(['move','wrap','pick','empty','hire','assignTask','charge','service','parcel','loadParcel'].includes(c?.type))return fail('Handle this stock directly in its scene.');
  const result=old.command.call(this,c);if(result.ok&&c?.type==='fulfill')this.s.commerce.hands.order=c.order;return result;
 };
 const reachable=P.receivingReachable;
 P.receivingReachable=function(t,p){return O.manualHandling(this.s)?!t.manifest.some(id=>{const q=this.p.get(id);return q?.place==='trailer'&&Math.floor(q.index/2)<Math.floor(p.index/2);}):reachable.call(this,t,p);};
 const records=P.receivingPallets;
 P.receivingPallets=function(id){return records.call(this,id).map(p=>({...p,canUnload:O.manualHandling(this.s)&&p.place==='trailer'&&p.scanned&&p.reachable}));};
 const validate=O.saves.validate;
 O.saves.validate=function(raw){const s=validate(raw);if(!O.business(s))return s;const c=s.commerce;
  if(c.manualHandling!==undefined&&typeof c.manualHandling!=='boolean')throw Error('Invalid handling mode.');
  if(c.manualHandling){const h=c.hands,carry=s.pallets.find(p=>p.id===h?.carry);if(!h||typeof h!=='object'||h.carry!==null&&(!Number.isSafeInteger(h.carry)||!carry||carry.place!=='transit')||h.order!==null&&!c.orders.some(o=>o.id===h.order&&o.status==='queued')||s.workers.some(w=>w.task||w.queue.length))throw Error('Invalid player handling.');if(s.pallets.filter(p=>p.place==='transit').some(p=>p.id!==h.carry))throw Error('Unattended carried stock.');if(h.origin!==null&&(!h.origin||h.origin.place!=='lane'||!Number.isInteger(h.origin.x)||!Number.isInteger(h.origin.y)||!['receiving','shipping'].includes(h.origin.lane)))throw Error('Invalid carried origin.');}
  return s;
 };
})(typeof globalThis!=='undefined'?globalThis:window);
