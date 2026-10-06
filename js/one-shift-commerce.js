(function (root) {
  'use strict';
  const O = root.OneShift, P = O.Sim.prototype;
  const legacy = {schedule:P.schedule, command:P.command, assign:P.assign, depart:P.depart, nextDay:P.nextDay};
  const notice = (s,text,kind='notice') => {s.events.push({text,kind,tick:s.tick});if(s.events.length>80)s.events.shift();};
  P.random=function(){let a=this.s.rng|0;a^=a<<13;a^=a>>>17;a^=a<<5;this.s.rng=a>>>0;return this.s.rng/4294967296;};
  const pallet=P.pallet;
  P.pallet=function(...args){const p=pallet.apply(this,args);if(this.s.mode==='business'){p.unitCost=p.unitCost??O.catalog[p.item]?.buy??0;p.costBasis=p.costBasis??p.cases*p.unitCost;}return p;};
  const active = o => o.status === 'queued';
  const stockPlace = p => ['storage','lane'].includes(p.place) && p.cases > 0 && !p.hold;
  O.price=cents=>'$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2});
  O.catalog = {
    stove:{name:'Stoves',buy:400,sell:800,unlock:0},
    lantern:{name:'Lanterns',buy:200,sell:450,unlock:0},
    chair:{name:'Chairs',buy:300,sell:650,unlock:0},
    radio:{name:'Radios',buy:650,sell:1300,unlock:8},
    notebook:{name:'Notebooks',buy:100,sell:260,unlock:20}
  };
  O.businessUpgrades = ['rack','walkie','cart','wrapStand','wrapper','training','usedLift','upper','door','expansion'];
  O.businessUpgradeUnlocks = Object.freeze({rack:0,cart:3,wrapStand:3,walkie:5,training:5,usedLift:8,upper:8,door:8,wrapper:12,expansion:12});
  O.business = s => s.mode === 'business' && !!s.commerce;
  O.unlockedGoods = s => Object.keys(O.catalog).filter(id=>s.commerce.completed >= O.catalog[id].unlock);
  O.businessAssets = s => s.cash-s.credit+s.pallets.filter(p=>!['empty','shipped','returned','scrap'].includes(p.place)).reduce((n,p)=>n+(p.costBasis??p.cases*(p.unitCost||0)),0)+Object.entries(s.owned).reduce((n,[id,count])=>n+(O.equipment.find(e=>e.id===id)?.cost||0)*100*count*.7,0);
  P.claimedCases = function(id,except=null) {return this.s.commerce.orders.filter(active).filter(o=>o.id!==except).reduce((n,o)=>n+o.allocations.filter(a=>a.source===id && !a.collected).reduce((n,a)=>n+a.count,0),0);};
  P.businessAvailable = function(item) {return this.s.pallets.filter(p=>p.item===item&&stockPlace(p)&&p.confirmed&&!p.businessOrder&&(!p.reservedBy||this.s.workers.some(w=>[w.task,...w.queue].some(t=>t?.kind==='salePick'&&t.sources.some(q=>q.pallet===p.id))))).sort((a,b)=>a.receivedDay-b.receivedDay||a.id-b.id);};
  P.surplusQuote = function(item) {const p=this.businessAvailable(item).find(p=>!this.claimedCases(p.id)&&!p.reservedBy);return p?{pallet:p.id,count:p.cases,price:Math.round(p.unitCost*.7),value:p.cases*Math.round(p.unitCost*.7)}:null;};
  P.businessStock = function(item) {
    const s=this.s,ps=s.pallets.filter(p=>p.item===item && !['empty','shipped','returned','scrap'].includes(p.place));
    const ready=this.businessAvailable(item),readyIds=new Set(ready.map(p=>p.id));
    const free=ready.reduce((n,p)=>n+Math.max(0,p.cases-this.claimedCases(p.id)),0);
    return {free,stored:ps.filter(p=>p.place!=='trailer').reduce((n,p)=>n+p.cases,0),incoming:ps.filter(p=>!p.hold&&!p.businessOrder&&!readyIds.has(p.id)).reduce((n,p)=>n+p.cases,0)};
  };
  P.businessSpot=function(w,p){const s=this.s,high=O.has(s,'forklift')&&['player','driver','robot'].includes(w.role);for(const r of s.map.racks)for(let level=0;level<(high?r.levels:1);level++)for(let side=0;side<2;side++){const x=r.x+side,y=r.y;if(!this.occupied(x,y,level,p.id)&&O.pathing.path(s,w,{x,y:y+(O.has(s,'forklift')?2:1)},high))return {x,y,level,place:'storage',rack:r.id};}return null;};
  P.businessCapacity = function() {
    const s=this.s,slots=s.map.racks.reduce((n,r)=>n+2*(O.has(s,'forklift')?r.levels:1),0);
    const stored=s.pallets.filter(p=>p.place==='storage'&&p.cases>0).length;
    const moving=s.workers.flatMap(w=>[w.task,...w.queue].filter(Boolean)).filter(t=>t.dest?.place==='storage'&&this.p.get(t.pallet)?.place!=='storage').length;
    const unstored=s.pallets.filter(p=>p.cases>0&&!p.businessOrder&&['lane','trailer'].includes(p.place)&&!p.reservedBy).length;
    return {slots,used:stored+moving+unstored,free:Math.max(0,slots-stored-moving-unstored)};
  };
  P.restockQuote = function(item,count) {
    const s=this.s,d=O.catalog[item];
    if(!d || !O.unlockedGoods(s).includes(item) || ![8,16,32].includes(count))return {reason:'Choose available stock.'};
    const unitCost=Math.round(d.buy*(count===8?1.12:count===32?.95:1));
    const cost=unitCost*count+600,slots=Math.ceil(count/(O.items[item].ti*O.items[item].hi));
    const capacity=this.businessCapacity();
    const reason=capacity.free<slots?'Add a rack or ship stock.':s.cash+50000-s.credit<cost?'Not enough cash or credit.':'';
    return {cost,unitCost,slots,lead:count===8?45:count===16?75:105,reason,credit:Math.max(0,cost-s.cash)};
  };
  P.makeBusinessOrder = function(arrival,lines,extra={}) {
    const s=this.s,c=s.commerce,rush=!!extra.rush;
    const o={id:this.id(),day:s.day,arrival,due:Math.min(s.shiftEnd-10,arrival+(s.day===1?240:rush?100:170)+(lines.length>1?60:0)),customer:['Pine Supply','Nightjar Market','Field House','Weekend Outfitters','Northline Store'][(c.serial++)%5],status:'future',lines:lines.map(l=>({...l,price:Math.round(O.catalog[l.item].sell*(rush?1.2:1)*(s.day===1?1:1+Math.max(-.1,Math.min(.1,(s.reputation-75)*.004))))})),allocations:[],truck:null,worker:null,paid:0,cogs:0,rush,...extra};
    c.orders.push(o);return o;
  };
  P.schedule = function() {
    const s=this.s;if(s.mode!=='business')return legacy.schedule.call(this);
    if(!s.commerce){
      s.cash=s.openingCash=20000;s.minute=480;s.shiftEnd=1020;s.reputation=75;
      s.commerce={version:1,orders:[],queue:[],history:[],purchases:[],completed:0,onTime:0,totalSales:0,totalCogs:0,serial:0,restocked:0,firstDecision:true,won:false};
      s.map.racks[1].x=15;s.map.racks[2].x=21;Object.assign(s.map.racks[3],{x:9,y:14});s.map.revision++;
      const items=[['stove',24],['stove',16],['lantern',24],['lantern',16],['chair',16],['chair',8]];
      items.forEach(([item,cases],i)=>{const r=s.map.racks[Math.floor(i/2)];this.pallet(item,'trail',cases,null,{place:'storage',x:r.x+i%2,y:r.y,confirmed:true,scanned:true,unitCost:O.catalog[item].buy});s.goods.arrived+=cases;});
    }
    const c=s.commerce,goods=O.unlockedGoods(s),popular=goods[(s.day-1)%goods.length];
    c.popular=popular;c.headline={stove:'Camping weekend',lantern:'After dark',chair:'Outdoor gatherings',radio:'Trail season',notebook:'Back to school'}[popular];
    const n=Math.min(12,5+Math.floor(c.completed/5));
    if(s.day===1){
      this.makeBusinessOrder(480,[{item:'lantern',cases:8}]);
      this.makeBusinessOrder(545,[{item:'stove',cases:12},{item:'chair',cases:4}]);
      this.makeBusinessOrder(670,[{item:'lantern',cases:12}]);
      this.makeBusinessOrder(795,[{item:'chair',cases:12},{item:'stove',cases:8}]);
      this.makeBusinessOrder(900,[{item:'stove',cases:8}]);
    }else for(let i=0;i<n;i++){
      const arrival=Math.round(485+i*(420/(n-1))),item=this.random()<.5?popular:goods[Math.floor(this.random()*goods.length)];
      const lines=[{item,cases:4+Math.floor(this.random()*4)*4}];
      if(i%3===1){const other=goods[(goods.indexOf(item)+1)%goods.length];lines.push({item:other,cases:4+Math.floor(this.random()*2)*4});}
      this.makeBusinessOrder(arrival,lines,{rush:s.day>=3&&i%4===2});
    }
    c.forecast=Object.fromEntries(goods.map(item=>[item,c.orders.filter(o=>o.day===s.day).reduce((n,o)=>n+o.lines.filter(l=>l.item===item).reduce((n,l)=>n+l.cases,0),0)]));
    s.weather=s.day%4===0?'rain':'clear';this.businessArrivals();
  };
  P.businessArrivals = function() {
    const s=this.s,c=s.commerce;
    for(const o of c.orders){
      if(o.status==='future' && s.minute>=o.arrival){o.status='offered';notice(s,'New order / '+o.customer,'order');}
      if(['offered','future'].includes(o.status)&&s.minute>=o.due){o.status='missed';s.dayMissed++;s.reputation=Math.max(20,s.reputation-1);}
      if(active(o)&&s.minute>=o.due){const t=this.t.get(o.truck);if(t&&['docked','yard'].includes(t.status))this.depart(t);else this.cancelBusinessOrder(o,'missed');}
    }
    for(const purchase of c.purchases)if(!purchase.stored&&purchase.pallets.every(id=>(purchase.received||[]).includes(id)||this.p.get(id)?.place==='storage')){purchase.stored=true;c.restocked++;notice(s,'Stock on the racks.','restock');}
    if(!c.won&&c.completed>=50&&O.businessAssets(s)>=300000){c.won=true;notice(s,'Warehouse established. Keep growing.','milestone');}
  };
  P.cancelBusinessOrder = function(o,status='cancelled') {
    const s=this.s;
    for(const w of s.workers){
      const task=w.task,kept=w.queue.filter(t=>t.businessOrder!==o.id);
      for(const t of w.queue)if(t.businessOrder===o.id)this.release(t);
      w.queue=[];if(task?.businessOrder===o.id)this.clearWork(w);w.queue=kept;
    }
    for(const a of o.allocations){const p=this.p.get(a.output);if(p&&p.place!=='shipped'){p.businessOrder=null;if(!p.cases&&!p.reservedBy&&p.place!=='empty'){p.place='empty';s.emptyPallets++;}if(p.place==='lane'&&p.cases){const lane=this.lane('shipping',p);if(lane?.place==='lane')Object.assign(p,lane);}}}
    o.status=status;s.commerce.firstDecision=false;s.commerce.queue=s.commerce.queue.filter(id=>id!==o.id);
    if(status==='missed'){s.dayMissed++;s.reputation=Math.max(20,s.reputation-2);}
    const t=this.t.get(o.truck);if(t&&!t.departureRequested&&['docked','yard'].includes(t.status))this.depart(t);else if(t?.status==='scheduled')t.status='gone';else if(t?.status==='arriving'){t.status='leaving';t.animation=0;t.opened=false;}
  };
  P.command = function(c) {
    const s=this.s;if(!O.business(s))return legacy.command.call(this,c);
    if(!c||typeof c!=='object'||Array.isArray(c))return {ok:false,reason:'Choose an action.'};
    const fail=reason=>({ok:false,reason}),b=s.commerce,o=b.orders.find(o=>o.id===c.order);
    if(c.type==='sellSurplus'){
      if(s.phase!=='shift'||s.minute>s.shiftEnd-60||b.orders.length>=30||b.orders.some(o=>o.buyback&&active(o)))return fail('Finish the current supplier return.');
      const q=this.surplusQuote(c.item);if(!q)return fail('No unreserved surplus.');
      const sale=this.makeBusinessOrder(s.minute,[{item:c.item,cases:q.count}],{customer:'Supplier buyback',buyback:true,status:'offered',due:Math.min(s.shiftEnd-5,s.minute+240)});sale.lines[0].price=q.price;
      const result=this.command({type:'fulfill',order:sale.id});if(!result.ok)b.orders=b.orders.filter(o=>o.id!==sale.id);return result;
    }
    if(c.type==='fulfill'){
      if(!o||o.status!=='offered'||s.phase!=='shift'||s.minute>=o.due)return fail('That order has closed.');
      const worker=c.worker||null;if(worker&&!s.workers.some(w=>w.id===worker))return fail('Choose a worker.');
      const allocations=[];
      for(const l of o.lines){let left=l.cases;for(const p of this.businessAvailable(l.item)){
        const count=Math.min(left,Math.max(0,p.cases-this.claimedCases(p.id)));if(!count)continue;
        if(!O.pathing.path(s,s.workers.find(w=>w.id===worker)||s.workers[0],this.approach(p),O.has(s,'forklift')))continue;
        allocations.push({source:p.id,count,output:null,collected:false,unitCost:p.unitCost||O.catalog[p.item].buy});left-=count;if(!left)break;
      }if(left)return fail('Restock '+O.catalog[l.item].name.toLowerCase()+'.');}
      o.allocations=allocations;o.status='queued';o.worker=worker;b.queue.push(o.id);b.firstDecision=false;
      // The customer truck comes once the shipment is staged, leaving the dock free for stock deliveries.
      notice(s,'Order queued.','queued');return {ok:true};
    }
    if(c.type==='cancelOrder'){
      if(!o||!['offered','queued'].includes(o.status))return fail('That order has closed.');
      if(this.t.get(o.truck)?.loaded.length)return fail('Already loading. Finish this order.');
      this.cancelBusinessOrder(o);return {ok:true};
    }
    if(c.type==='orderPriority'){
      const i=b.queue.indexOf(c.order),j=i+Number(c.direction);
      if(i<0||![1,-1].includes(c.direction)||j<0||j>=b.queue.length)return fail('Choose a waiting order.');
      [b.queue[i],b.queue[j]]=[b.queue[j],b.queue[i]];return {ok:true};
    }
    if(c.type==='restock'){
      const q=this.restockQuote(c.item,c.count);if(q.reason)return fail(q.reason);
      if(!O.spend(s,'Inventory',(q.cost-600)/100,'Stock / '+O.catalog[c.item].name))return fail('Not enough cash.');
      O.spend(s,'Freight',6,'Supplier delivery');
      const arrival=s.phase==='evening'?480+q.lead:s.minute+q.lead,nextDay=s.phase==='evening'||arrival>=s.shiftEnd-20;
      const items=[];let left=c.count;while(left){const cases=Math.min(left,O.items[c.item].ti*O.items[c.item].hi);items.push({item:c.item,cases,confirmed:true,scanned:true,unitCost:q.unitCost});left-=cases;}
      const t=this.truck('in','trail',nextDay?480+q.lead:arrival,items,[],{freeMinutes:10000,deliveryDay:s.day+Number(nextDay),supplier:true});
      const purchase={id:this.id(),day:s.day,item:c.item,count:c.count,cost:q.cost,truck:t.id,pallets:t.manifest.slice(),received:[],stored:false};b.purchases.push(purchase);t.purchase=purchase.id;
      notice(s,nextDay?'Delivery tomorrow.':'Stock ordered.','purchase');return {ok:true};
    }
    // Business orders own their reservations. Detailed handling remains available for free stock.
    if(['contract','service','parcel','loadParcel','skipScan'].includes(c.type)||!this.businessPlanning&&(['pick','empty','wrap','dispatch'].includes(c.type)||c.type==='move'&&c.dest?.truck))return fail('Use customer orders.');
    if(!this.businessPlanning&&['pick','move','hold','scrap'].includes(c.type)&&c.pallet){const p=this.p.get(c.pallet);if(p?.businessOrder||this.claimedCases(c.pallet))return fail('This stock is reserved for an order.');}
    if(c.type==='hire'&&s.cash<7500)return fail('Need $75 cash.');
    if(c.type==='move'&&(c.dest?.level||this.p.get(c.pallet)?.level)){const w=s.workers.find(w=>w.id===(c.worker||1));if(w&&!['player','driver','robot'].includes(w.role))return fail('Choose a forklift operator for upper stock.');}
    if(c.type==='buy'&&!O.businessUpgrades.includes(c.id))return fail('Choose a warehouse upgrade.');
    if(c.type==='build'&&c.kind==='rack'){
      const reason=O.purchaseReason(s,'rack');if(reason)return fail(reason);
      const x=Math.round(c.x),y=Math.round(c.y),placement=this.rackReason(x,y);if(placement)return fail(placement);
      const cost=O.equipment.find(e=>e.id==='rack').cost;
      if(!O.spend(s,'Purchases',cost,'Placed rack'))return fail('Need '+O.money(cost));
      s.map.racks.push({id:this.id(),x,y,levels:s.owned.upper?4:1});s.owned.rack=(s.owned.rack||0)+1;s.map.revision++;
      return {ok:true};
    }
    if(c.type==='reject'&&this.t.get(c.truck)?.supplier)return fail('Paid stock stays until you can receive it.');
    return legacy.command.call(this,c);
  };
  P.businessTask = function(w,command,order) {
    this.businessPlanning=true;let r;try{r=this.command({...command,worker:w.id});}finally{this.businessPlanning=false;}
    if(r.ok&&w.queue.at(-1)){w.queue.at(-1).businessOrder=order?.id||null;return true;}return false;
  };
  P.assign = function() {
    const s=this.s;if(!O.business(s))return legacy.assign.call(this);
    this.businessArrivals();const b=s.commerce;if(s.minute>=s.shiftEnd)return;
    for(const w of s.workers){
      if(w.task||w.queue.length)continue;
      let assigned=false;
      for(const id of b.queue){const o=b.orders.find(o=>o.id===id);if(!o||!active(o)||o.worker&&o.worker!==w.id)continue;
        const t=this.t.get(o.truck);if(t?.departureRequested)continue;
        // Finish staged pallets before starting another one, keeping the shipping lane usable.
        for(const a of o.allocations){const p=this.p.get(a.output);if(!p||!p.cases||p.reservedBy||!stockPlace(p))continue;
          if(!p.wrapped&&o.allocations.filter(q=>q.output===p.id).every(q=>q.collected))assigned=this.businessTask(w,{type:'wrap',pallet:p.id},o);
          else if(t?.status==='docked')assigned=this.businessTask(w,{type:'move',pallet:p.id,dest:{truck:t.id}},o);
          if(assigned)break;
        }
        if(assigned)break;
        for(const line of o.lines){
          const allocations=o.allocations.map((a,i)=>({...a,index:i})).filter(a=>this.p.get(a.source)?.item===line.item&&!a.collected);
          if(!allocations.length||allocations.some(a=>{const p=this.p.get(a.source);return !stockPlace(p)||p.reservedBy||p.level&&!(w.role==='player'||w.role==='driver'||w.role==='robot');}))continue;
          const out=this.p.get(allocations.find(a=>a.output)?.output);if(out?.reservedBy)continue;
          const dest=this.lane('shipping');if(!dest||dest.place!=='lane')continue;
          const source=this.p.get(allocations[0].source),start=out?.cases?this.approach(out):this.approach(source),end={x:dest.x,y:dest.y};
          let route=start,clear=!!O.pathing.path(s,w,start,O.has(s,'forklift'));
          for(const a of allocations){const next=this.approach(this.p.get(a.source));if(!O.pathing.path(s,route,next,O.has(s,'forklift')))clear=false;route=next;}
          if(!clear||!O.pathing.path(s,route,end,O.has(s,'forklift')))continue;
          if(!out&&s.emptyPallets<1){if(!O.spend(s,'Packaging',2,'Shipping pallet'))continue;s.emptyPallets++;}
          if(!out)s.emptyPallets--;
          const output=out||this.pallet(source.item,'trail',0,null,{...O.docks.stack(s),confirmed:true,scanned:true,pick:true,wrapped:false,labelled:false,businessOrder:o.id,unitCost:source.unitCost,costBasis:0,lot:source.lot,receivedDay:source.receivedDay,bestBy:source.bestBy});
          for(const a of allocations)o.allocations[a.index].output=output.id;
          const sources=allocations.map(a=>({pallet:a.source,count:a.count,allocation:a.index})),count=sources.reduce((n,q)=>n+q.count,0);
          this.enqueue(w,{kind:'salePick',pallet:source.id,output:output.id,count,sources,sourceIndex:0,pickedUp:!output.cases,dest,start,end,duration:Math.max(.7,count*.12/(s.owned.cart?1.5:1)),businessOrder:o.id});
          const task=w.queue.at(-1);for(const q of sources)this.p.get(q.pallet).reservedBy=task.id;assigned=true;break;
        }
        if(assigned)break;
      }
      if(assigned)continue;
      const inbound=s.trucks.find(t=>t.supplier&&t.status==='docked'&&!t.departureRequested);
      if(inbound){inbound.checked=inbound.inspected=inbound.opened=true;const p=inbound.manifest.map(id=>this.p.get(id)).find(p=>p?.place==='trailer'&&!p.reservedBy&&this.reachable(inbound,p));const dest=p&&this.businessSpot(w,p);if(dest&&this.businessTask(w,{type:'move',pallet:p.id,dest},null))continue;}
      const p=s.pallets.find(p=>stockPlace(p)&&p.place==='lane'&&!p.businessOrder&&!p.reservedBy&&!this.claimedCases(p.id)),dest=p&&this.businessSpot(w,p);if(dest)this.businessTask(w,{type:'move',pallet:p.id,dest},null);
    }
    for(const o of b.orders.filter(active)){
      if(!o.truck&&o.allocations.every(a=>a.collected)&&o.lines.every(l=>{const a=o.allocations.find(a=>this.p.get(a.source)?.item===l.item),p=this.p.get(a?.output);return p?.cases===l.cases&&p.wrapped&&!p.reservedBy;})){const t=this.truck('out','trail',s.minute,[],o.lines.map(l=>({item:l.item,cases:l.cases,full:false})),{deadline:o.due,freeMinutes:10000,businessOrder:o.id});o.truck=t.id;}
      const t=this.t.get(o.truck);if(t?.status==='docked'&&t.order.every(l=>!this.remaining(t,l)))this.depart(t);
    }
  };
  P.depart = function(t) {
    const s=this.s;if(!O.business(s)||!t.businessOrder)return legacy.depart.call(this,t);
    if(t.departureRequested||!['docked','yard'].includes(t.status))return;
    const o=s.commerce.orders.find(o=>o.id===t.businessOrder),missing=t.order.reduce((n,l)=>n+this.remaining(t,l),0),complete=!missing;
    this.requestTruckExit(t);t.departureSeal='CLOSED';
    if(!o||o.paid)return;
    const late=!complete||s.minute>o.due+.1,paid=t.loaded.reduce((n,l)=>n+l.cases*(o.lines.find(q=>q.item===l.item)?.price||0),0)*(late?.9:1),cogs=t.loaded.reduce((n,l)=>n+(this.p.get(l.pallet)?.costBasis||0),0);
    o.paid=Math.round(paid);o.cogs=cogs;o.status=complete?'complete':'missed';o.finished=s.minute;
    s.commerce.queue=s.commerce.queue.filter(id=>id!==o.id);
    if(paid)O.post(s,'Sales',o.paid/100,o.customer);
    s.commerce.totalSales+=o.paid;s.commerce.totalCogs+=cogs;
    if(complete&&o.buyback){notice(s,'Surplus sold / '+O.money(o.paid/100),'sale');}
    else if(complete){s.commerce.completed++;s.dayOnTime++;if(!late)s.commerce.onTime++;s.reputation=Math.min(100,s.reputation+1);notice(s,'Sold / '+O.money(o.paid/100),'sale');if([1,8,20,50].includes(s.commerce.completed))notice(s,s.commerce.completed===8?'Radios unlocked.':s.commerce.completed===20?'Notebooks unlocked.':s.commerce.completed===50?'50 orders shipped.':'First sale.','milestone');}
    else {s.dayMissed++;s.reputation=Math.max(20,s.reputation-2);notice(s,'Order closed / partial sale.','missed');}
    // Stop any unfinished picks; already collected goods return to available stock.
    const status=o.status;this.cancelBusinessOrder(o,'cancelled');o.status=status;
  };
  P.nextDay = function() {
    const s=this.s;if(!O.business(s))return legacy.nextDay.call(this);
    for(const w of s.workers){this.clearWork(w);w.battery=100;w.fatigue=0;}
    const c=s.commerce;c.history.push(...c.orders.map(o=>({id:o.id,day:o.day,customer:o.customer,status:o.status,paid:o.paid,cogs:o.cogs})));c.history=c.history.slice(-300);c.orders=[];c.queue=[];c.firstDecision=false;
    const carry=s.trucks.filter(t=>t.supplier&&t.manifest.some(id=>this.p.get(id)?.place==='trailer'));
    for(const t of carry){t.status='scheduled';t.door=null;t.arrival=480+(t.deliveryDay>s.day?Math.max(10,t.appointment-480):15);t.appointment=t.arrival;t.deadline=10000;t.animation=0;t.departureRequested=false;t.closingTick=null;}
    s.trucks=carry;s.pallets=s.pallets.filter(p=>!['empty','shipped','returned','scrap'].includes(p.place));for(const p of s.pallets)p.businessOrder=null;
    c.purchases=c.purchases.filter(p=>!p.stored || p.day>=s.day-6);
    for(const p of s.pallets.filter(p=>p.place==='lane'&&p.cases)){const lane=this.lane('receiving',p);if(lane?.place==='lane')Object.assign(p,lane);}
    s.day++;s.minute=480;s.phase='shift';s.openingCash=s.cash;s.dayShipped=s.dayOnTime=s.dayMissed=0;s.workMinutes={};s.journal=s.journal.filter(e=>e.day>=s.day-60);s.map.revision++;this.reindex();this.schedule();notice(s,'Day '+s.day+' / '+c.headline,'shift');
  };
  P.collectSale=function(w,t){
    const s=this.s,out=this.p.get(t.output),lift=O.has(s,'forklift');
    if(!t.pickedUp){t.pickedUp=true;out.place='transit';t.path=O.pathing.path(s,w,this.approach(this.p.get(t.sources[0].pallet)),lift);return;}
    const q=t.sources[t.sourceIndex],p=this.p.get(q.pallet),o=s.commerce.orders.find(o=>o.id===t.businessOrder);
    if(!p||p.cases<q.count||p.hold||p.reservedBy!==t.id){this.clearWork(w);notice(s,'Pick paused. Stock unavailable.');return;}
    const cost=q.count===p.cases?p.costBasis:Math.round(p.costBasis*q.count/p.cases);
    p.costBasis-=cost;p.cases-=q.count;p.bookCases=p.cases;out.cases+=q.count;out.bookCases=out.cases;out.costBasis+=cost;out.unitCost=Math.round(out.costBasis/out.cases);
    out.receivedDay=Math.min(out.receivedDay,p.receivedDay);out.bestBy=Math.min(out.bestBy,p.bestBy);if(out.lot!==p.lot)out.lot='MIXED';
    Object.assign(out,{place:'transit',x:w.x,y:w.y,level:0});if(!p.cases){p.place='empty';s.emptyPallets++;}
    o.allocations[q.allocation].collected=true;t.sourceIndex++;t.collected=true;this.occTick=-1;
    const next=t.sources[t.sourceIndex];if(!next)t.phase='dest';t.path=O.pathing.path(s,w,next?this.approach(this.p.get(next.pallet)):t.end,lift);
    if(!t.path){this.clearWork(w);notice(s,'Route blocked. Replan the order.');}
  };
  const release=P.release;
  P.release=function(task){release.call(this,task);if(task.kind==='salePick')for(const q of task.sources){const p=this.p.get(q.pallet);if(p?.reservedBy===task.id)p.reservedBy=null;}};
  const finish=P.finish;
  P.finish=function(w,task){const r=finish.call(this,w,task);
    if(r&&O.business(this.s)&&task.kind==='unload'){const purchase=this.s.commerce.purchases.find(p=>p.pallets.includes(task.pallet));if(purchase){if(!purchase.received.includes(task.pallet))purchase.received.push(task.pallet);}}
    if(r&&task.kind==='salePick')for(const q of task.sources){const p=this.p.get(q.pallet);if(p?.reservedBy===task.id)p.reservedBy=null;}return r;
  };
  // Service fees belong to the legacy warehouse simulation, never to player-owned stock.
  const post=O.post;
  O.post=function(s,category,amount,reason){if(O.business(s)&&['Receiving','Shipping','Storage','Parcel','Cross-dock','Chargebacks'].includes(category))return;if(O.business(s)&&category==='Wrap and labels'){category='Packaging';amount=-.5;reason='Shipping materials';}post(s,category,amount,reason);};
  const purchaseReason=O.purchaseReason;
  O.purchaseReason=function(s,id){
    if(!O.business(s))return purchaseReason(s,id);
    const e=O.equipment.find(e=>e.id===id);if(!e||!O.businessUpgrades.includes(id))return 'Unavailable';
    const unlock=O.businessUpgradeUnlocks[id];if(!s.owned[id]&&s.commerce.completed<unlock)return unlock+' orders to unlock';
    // Business stock already has picking racks. Keep the other equipment dependencies intact.
    const owned=id==='cart'&&s.map.racks.length?{...s.owned,shelves:1}:s.owned;
    const reason=purchaseReason({...s,day:Math.max(s.day,2),owned,cash:Math.max(s.cash,e.cost*100)},id);
    if(reason)return reason;if(s.cash<e.cost*100)return 'Need '+O.money(e.cost);return '';
  };
  const tick=P.tick;
  P.tick=function(advanceClock=true){if(O.business(this.s)&&this.s.minute>=this.s.shiftEnd-.1){for(const o of this.s.commerce.orders.filter(o=>['future','offered','queued'].includes(o.status)))this.cancelBusinessOrder(o,'missed');}tick.call(this,advanceClock);};
  const settle=O.settle;
  O.settle=function(s){if(!O.business(s))return settle(s);
    O.post(s,'Rent',-18,'Daily rent');for(const w of s.workers.slice(1))O.post(s,'Wages',-w.wage,w.name);
    if(O.has(s,'forklift'))O.post(s,'Equipment',-5,'Forklift power');
    if(s.credit){O.post(s,'Interest',-s.credit*.0003/100,'Credit interest');const repayment=Math.min(s.credit,Math.max(0,s.cash-15000));if(repayment){s.credit-=repayment;O.post(s,'Credit',-repayment/100,'Credit repayment');}}
    const entries=s.journal.filter(e=>e.day===s.day),by={};for(const e of entries)by[e.category]=(by[e.category]||0)+e.cents;
    const cogs=s.commerce.orders.reduce((n,o)=>n+o.cogs,0);by['Stock sold']=-cogs;
    const profit=entries.filter(e=>!['Inventory','Purchases','Credit'].includes(e.category)).reduce((n,e)=>n+e.cents,0)-cogs;
    const bottleneck=Object.entries(s.workMinutes).sort((a,b)=>b[1]-a[1])[0];
    const report={day:s.day,opening:s.openingCash,closing:s.cash,entries,by,profit,casesShipped:s.dayShipped,onTime:s.dayOnTime,missed:s.dayMissed,bottleneck:bottleneck?.[0]||'Idle',minutes:bottleneck?.[1]||0};
    s.reports.push(report);if(s.reports.length>365)s.reports.shift();s.records.profit=Math.max(s.records.profit,profit);s.phase='evening';notice(s,'Shift finished.','shift');return report;
  };
  const validate=O.saves.validate;
  O.saves.validate=function(raw){const s=validate(raw);if(s.mode!=='business')return s;
    const c=s.commerce,int=(n,min=0)=>Number.isSafeInteger(n)&&n>=min,finite=n=>Number.isFinite(n)&&n>=0;
    if(!c||c.version!==1||!['orders','queue','history','purchases'].every(k=>Array.isArray(c[k]))||c.orders.length>30||c.queue.length>30||c.history.length>300||c.purchases.length>10000||!['completed','onTime','totalSales','totalCogs','serial','restocked'].every(k=>int(c[k]))||typeof c.firstDecision!=='boolean'||typeof c.won!=='boolean')throw Error('Invalid business.');
    if(!O.catalog[c.popular]||typeof c.headline!=='string'||c.headline.length>100||!c.forecast||Object.entries(c.forecast).some(([id,n])=>!O.catalog[id]||!int(n)))throw Error('Invalid demand forecast.');
    for(const h of c.history)if(!int(h.id,1)||!int(h.day,1)||h.day>=s.day||typeof h.customer!=='string'||h.customer.length>100||!['complete','missed','cancelled'].includes(h.status)||!int(h.paid)||!int(h.cogs))throw Error('Invalid business history.');
    const ids=new Set(),outputs=new Map(),claim=new Map();
    for(const o of c.orders){if(!int(o.id,1)||ids.has(o.id)||o.id>=s.nextId||!int(o.day,1)||o.day!==s.day||!finite(o.arrival)||!finite(o.due)||o.due<=o.arrival||o.due>s.shiftEnd||typeof o.customer!=='string'||o.customer.length>100||!['future','offered','queued','complete','cancelled','missed'].includes(o.status)||!Array.isArray(o.lines)||o.lines.length<1||o.lines.length>5||new Set(o.lines.map(l=>l.item)).size!==o.lines.length||!Array.isArray(o.allocations)||o.allocations.length>100||!int(o.paid)||!int(o.cogs)||o.worker&&!s.workers.some(w=>w.id===o.worker)||o.truck&&!s.trucks.some(t=>t.id===o.truck&&t.businessOrder===o.id))throw Error('Invalid customer order.');ids.add(o.id);
      for(const l of o.lines)if(!O.catalog[l.item]||!int(l.cases,1)||l.cases>100||!int(l.price,1)||l.price>10000)throw Error('Invalid sale line.');
      for(const a of o.allocations){const p=s.pallets.find(p=>p.id===a.source),out=s.pallets.find(p=>p.id===a.output);if(!int(a.count,1)||!int(a.unitCost,1)||a.unitCost>10000||typeof a.collected!=='boolean'||active(o)&&!p||a.output&&!out||a.output&&outputs.has(a.output)&&outputs.get(a.output)!==o.id)throw Error('Invalid stock allocation.');if(a.output)outputs.set(a.output,o.id);if(active(o)&&!a.collected)claim.set(a.source,(claim.get(a.source)||0)+a.count);}
      if(active(o)){const quantities={};for(const a of o.allocations){const p=s.pallets.find(p=>p.id===a.source);quantities[p.item]=(quantities[p.item]||0)+a.count;}if(o.lines.some(l=>quantities[l.item]!==l.cases)||Object.keys(quantities).length!==o.lines.length)throw Error('Incomplete stock allocation.');}
    }
    if(new Set(c.queue).size!==c.queue.length||c.queue.some(id=>!c.orders.some(o=>o.id===id&&active(o)))||c.orders.filter(active).some(o=>!c.queue.includes(o.id)))throw Error('Invalid order queue.');
    for(const [id,n] of claim)if(s.pallets.find(p=>p.id===id).cases<n)throw Error('Stock reserved twice.');
    for(const p of s.pallets)if(!int(p.unitCost)||p.unitCost>10000||!int(p.costBasis)||p.costBasis>p.cases*10000||p.businessOrder&&!ids.has(p.businessOrder))throw Error('Invalid stock cost.');
    for(const purchase of c.purchases)if(!int(purchase.id,1)||purchase.id>=s.nextId||!O.catalog[purchase.item]||!int(purchase.day,1)||!int(purchase.count,1)||!int(purchase.cost,1)||!Array.isArray(purchase.pallets)||typeof purchase.stored!=='boolean'||!purchase.stored&&purchase.pallets.some(id=>!(purchase.received||[]).includes(id)&&!s.pallets.some(p=>p.id===id)))throw Error('Invalid purchase.');
    for(const purchase of c.purchases)if(!Array.isArray(purchase.received)||new Set(purchase.received).size!==purchase.received.length||purchase.received.some(id=>!int(id,1)||!purchase.pallets.includes(id)))throw Error('Invalid supplier receipt.');
    for(const w of s.workers)for(const t of [w.task,...w.queue].filter(Boolean))if(t.kind==='salePick'&&(!int(t.count,1)||!t.output||!Array.isArray(t.sources)||!t.sources.length||new Set(t.sources.map(q=>q.pallet)).size!==t.sources.length||!int(t.sourceIndex)||t.sourceIndex>t.sources.length||typeof t.pickedUp!=='boolean'||t.sources.some(q=>!int(q.count,1)||!int(q.allocation)||!s.pallets.some(p=>p.id===q.pallet&&p.reservedBy===t.id))||!t.businessOrder||!c.orders.some(o=>o.id===t.businessOrder&&active(o))))throw Error('Invalid sale work.');
    for(const w of s.workers)for(const t of [w.task,...w.queue].filter(q=>q?.kind==='salePick')){
      const o=c.orders.find(o=>o.id===t.businessOrder);if(t.count!==t.sources.reduce((n,q)=>n+q.count,0)||t.phase==='dest'&&t.sourceIndex!==t.sources.length||t.phase==='source'&&t.sourceIndex>=t.sources.length)throw Error('Invalid pick stage.');
      for(const [index,q]of t.sources.entries()){const a=o.allocations[q.allocation];if(!a||a.source!==q.pallet||a.count!==q.count||a.output!==t.output||a.collected!==(index<t.sourceIndex))throw Error('Invalid grouped pick.');}
    }
    return s;
  };
  // Decode must use the extended validator, including imported saves.
  O.saves.decode=function(text){if(text.length>16000000)throw Error('Save is too large.');const q=JSON.parse(text);if(q.game!=='One Shift')throw Error('Choose a One Shift save.');return this.validate(q.state);};
})(typeof globalThis !== 'undefined' ? globalThis : window);
