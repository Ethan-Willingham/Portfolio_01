(function(root){
  'use strict';
  const O=root.OneShift,PAGE_SIZE=3;
  const artHash=value=>Array.from(String(value)).reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,17);
  O.palletArtIndex=p=>(artHash(p.item)+(Number.isInteger(p.id)&&p.id<=6?p.id-1:artHash(p.id)))%4;
  const scenes={
    staging:{title:'Receiving floor',subtitle:'Unloaded stock waits here for putaway.',emptyText:'Pallets appear here as the trailer is unloaded.'},
    storage:{title:'Storage',subtitle:'Stock in the racks, ready for customer orders.',emptyText:'Stock appears here after putaway.'},
    shipping:{title:'Shipping',subtitle:'Picked orders, wrapping and loading.',emptyText:'Prepare an order to bring its pallets to Shipping.'}
  };
  const inside=(p,r)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;
  const laneOf=(s,p)=>{
    // An expansion can move the markings while an existing pallet or task keeps
    // its original staging position. Its recorded lane remains authoritative.
    if(['receiving','shipping'].includes(p.lane))return p.lane;
    return ['receiving','shipping'].find(kind=>inside(p,O.docks.lane(s,kind)))||null;
  };
  function tasksOf(s){
    const tasks=[];
    for(const worker of s.workers)for(const task of [worker.task,...worker.queue].filter(Boolean))tasks.push({task,worker,active:task===worker.task});
    return tasks;
  }
  function taskFor(tasks,p){
    return tasks.find(q=>q.task.output===p.id)||tasks.find(q=>q.task.pallet===p.id||q.task.sources?.some(source=>source.pallet===p.id))||null;
  }
  function sceneFor(sim,p,job){
    const s=sim.s,task=job?.task;
    if(!p.cases||['empty','returned','scrap','trailer','shipped'].includes(p.place))return null;
    // A carried pick is described as work, not drawn in a Shipping position
    // before it arrives. Nor may it occupy the source pallet's rack position.
    if(task?.kind==='salePick'&&task.output===p.id)return null;
    if(p.businessOrder||task?.kind==='load'||task?.kind==='wrap')return 'shipping';
    if(p.place==='storage')return p.confirmed?'storage':null;
    if(p.receivingDestination||task?.kind==='unload')return 'staging';
    if(p.place==='lane'){
      const lane=laneOf(s,p);
      return lane==='receiving'?'staging':lane==='shipping'?'shipping':p.confirmed?'storage':null;
    }
    if(p.place==='transit'){
      if(task?.dest?.lane==='shipping'||laneOf(s,p)==='shipping')return 'shipping';
      if(task?.kind==='putaway')return 'staging';
    }
    return null;
  }
  function statusFor(sim,p,job,scene){
    const task=job?.task,active=job?.active;
    if(p.hold)return 'On hold';
    if(task?.kind==='unload')return active&&task.phase==='dest'?'Moving into Receiving':'Awaiting unload';
    if(task?.kind==='putaway')return active&&task.phase==='dest'?(task.dest?.lane==='shipping'?'Returning to Shipping':task.dest?.place==='storage'?'Moving to its rack':'Moving into Receiving'):'Awaiting putaway';
    if(task?.kind==='wrap')return active&&!task.path?.length?'Wrapping and labeling':'Awaiting wrap and label';
    if(task?.kind==='load')return active&&task.phase==='dest'?'Loading the truck':'Ready to load';
    if(task?.kind==='salePick'){
      if(task.output===p.id)return task.phase==='dest'?'Moving to Shipping':'Collecting order cases';
      const current=task.sources[task.sourceIndex];
      return active&&task.pickedUp&&current?.pallet===p.id&&!task.path?.length?'Picking cases':'Reserved for picking';
    }
    if(scene==='staging')return 'Awaiting putaway';
    if(scene==='shipping')return p.businessOrder?(p.wrapped&&p.labelled?'Ready to load':'Awaiting wrap and label'):'Returned stock';
    const claimed=O.business(sim.s)?sim.claimedCases(p.id):0;
    if(claimed)return claimed+' cases reserved';
    if(p.reservedBy)return 'Being handled';
    return 'Available stock';
  }
  function workFor(job,scene,sim){
    const {task,worker,active}=job,p=sim.p.get(task.output||task.pallet),name=worker.name||'Worker',prefix=name+': '+(active?'':'Queued to ');
    if(task.kind==='unload'&&scene==='staging')return prefix+(active?'Unloading into Receiving.':'unload into Receiving.');
    if(task.kind==='putaway'){
      const target=task.dest?.place==='storage'?'Storage':task.dest?.lane==='shipping'?'Shipping':'Receiving';
      const origin=p?.receivingDestination?'staging':p&&sceneFor(sim,p,job);
      if(scene!==origin&&!(scene==='storage'&&target==='Storage'))return null;
      return prefix+(active?'Moving a pallet to ':'move a pallet to ')+target+'.';
    }
    if(task.kind==='salePick'&&['storage','shipping'].includes(scene)){
      if(!task.pickedUp)return prefix+(active?'Collecting an empty shipping pallet.':'collect an empty shipping pallet.');
      if(task.phase==='dest')return prefix+(active?'Moving ':'move ')+(p?.cases||0)+' picked cases to Shipping.';
      return prefix+(active?'Picking cases for an order':'pick cases for an order')+(p?.cases?' ('+p.cases+' collected).':'.');
    }
    if(task.kind==='wrap'&&scene==='shipping')return prefix+(active?'Wrapping and labeling a pallet.':'wrap and label a pallet.');
    if(task.kind==='load'&&scene==='shipping')return prefix+(active?'Loading the customer truck.':'load the customer truck.');
    if(task.exitTruck&&scene==='shipping'&&sim.t.get(task.exitTruck)?.direction==='out')return name+': Clearing the trailer opening.';
    return null;
  }
  O.sceneSnapshot=function(sim,scene='storage',page=0){
    scene=Object.hasOwn(scenes,scene)?scene:'storage';
    const s=sim.s,tasks=tasksOf(s),pallets=[],rackPositions=[];
    if(scene==='storage')for(const rack of s.map.racks.slice().sort((a,b)=>a.id-b.id))for(let level=0;level<rack.levels;level++)for(let side=0;side<2;side++)rackPositions.push({rack:rack.id,x:rack.x+side,y:rack.y,level});
    for(const p of s.pallets){
      const job=taskFor(tasks,p);
      if(sceneFor(sim,p,job)!==scene)continue;
      const rack=p.place==='storage'?s.map.racks.find(r=>r.y===p.y&&p.x>=r.x&&p.x<r.x+2):null;
      const position=rackPositions.findIndex(q=>q.x===p.x&&q.y===p.y&&q.level===p.level);
      pallets.push({id:p.id,item:p.item,name:O.catalog?.[p.item]?.name||O.items[p.item].name,cases:p.cases,lot:p.lot,bestBy:p.bestBy,receivedDay:p.receivedDay,place:p.place,status:statusFor(sim,p,job,scene),selectable:true,sscc:p.sscc,wrapped:!!p.wrapped,labelled:!!p.labelled,order:p.businessOrder||null,worker:job?.worker.name||null,rack:rack?.id||null,level:p.level,moving:p.place==='transit',held:!!p.hold,position});
    }
    pallets.sort((a,b)=>a.id-b.id);
    let extra=0;
    pallets.forEach((p,index)=>{
      p.position=scene==='storage'?(p.position>=0?p.position:rackPositions.length+extra++):index;
      p.slot=p.position%PAGE_SIZE;p.page=Math.floor(p.position/PAGE_SIZE);
    });
    const total=pallets.length,capacity=scene==='storage'?rackPositions.length+extra:total,pages=Math.max(1,Math.ceil(capacity/PAGE_SIZE)),requested=Number(page);
    page=Math.max(0,Math.min(pages-1,Number.isFinite(requested)?Math.trunc(requested):0));
    // Work may mention a pallet still inside a trailer or an empty shipping
    // pallet. Only actual positive-case freight appears in the scene itself.
    const work=s.workers.flatMap(worker=>{
      const job=tasks.find(q=>q.worker===worker&&q.active)||tasks.find(q=>q.worker===worker);
      const text=job&&workFor(job,scene,sim);return text?[text]:[];
    });
    if(scene==='shipping')for(const truck of s.trucks.filter(t=>t.direction==='out'&&t.status!=='gone')){
      const cases=truck.loaded.reduce((n,p)=>n+p.cases,0);
      if(cases)work.push(cases+' cases loaded on the '+(truck.departureRequested?'departing':'customer')+' truck.');
    }
    const visible=pallets.filter(p=>p.page===page),emptyText=scene==='storage'&&total&&!visible.length?'No stock in this rack section.':scenes[scene].emptyText;
    return {scene,...scenes[scene],emptyText,page,pages,total,capacity,pallets:visible,work};
  };
  O.sceneBuyRack=function(sim){
    const s=sim.s;
    if(!O.business(s))return {ok:false,reason:'Start a business to add rack space.'};
    const reason=O.purchaseReason(s,'rack');if(reason)return {ok:false,reason};
    const b=s.map.building,candidates=[],seen=new Set();
    const add=(x,y)=>{const key=x+'/'+y;if(!seen.has(key)){seen.add(key);candidates.push({x,y});}};
    // Prefer the established aisle pattern, then other legal positions. The
    // normal build command remains responsible for capacity, ownership and cash.
    for(let y=b.y+4;y<b.y+b.h-3;y+=4)for(let x=b.x+4;x<b.x+b.w-1;x+=4)add(x,y);
    for(let y=b.y;y<b.y+b.h-3;y++)for(let x=b.x;x<b.x+b.w-1;x++)add(x,y);
    for(const {x,y}of candidates){
      if(sim.rackReason(x,y))continue;
      const proposed={...s,map:{...s.map,revision:s.map.revision+1,racks:[...s.map.racks,{id:s.nextId,x,y,levels:s.owned.upper?4:1}]}};
      const reachable=s.workers.some(w=>{
        const lift=O.has(s,'forklift')&&['player','driver','robot'].includes(w.role),offset=O.has(s,'forklift')?2:1;
        return [x,x+1].every(side=>O.pathing.path(proposed,w,{x:side,y:y+offset},lift));
      });
      if(reachable)return sim.command({type:'build',kind:'rack',x,y});
    }
    return {ok:false,reason:'No room for another rack. Clear its aisle or expand first.'};
  };
})(typeof globalThis!=='undefined'?globalThis:window);
