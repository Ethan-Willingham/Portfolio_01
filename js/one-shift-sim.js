(function (root) {
  'use strict';
  const O=root.OneShift,DT=.05,CLOCK=1.37;
  const copy=v=>JSON.parse(JSON.stringify(v));
  function random(s){let a=s.rng|0;a^=a<<13;a^=a>>>17;a^=a<<5;s.rng=a>>>0;return s.rng/4294967296;}
  function event(s,text,kind='notice'){s.events.push({kind,text,tick:s.tick});if(s.events.length>80)s.events.shift();}
  function map(){return {w:56,h:48,revision:0,dockSide:'east',building:{x:5,y:4,w:25,h:20},doors:[{id:1,x:30,y:14}],racks:[{id:1,x:9,y:8,levels:1},{id:2,x:13,y:8,levels:1},{id:3,x:17,y:8,levels:1},{id:4,x:21,y:8,levels:1}],zones:[],blocks:[],wear:{},stations:[]};}
  function state(seed=1,mode='normal') {
    const s={version:1,seed:seed>>>0||1,rng:seed>>>0||1,tick:0,day:1,minute:415,phase:'shift',cash:18000,credit:0,reputation:70,map:map(),pallets:[],trucks:[],workers:[{id:1,name:'You',role:'player',x:27,y:14,queue:[],task:null,path:[],equipment:'jack',battery:100,fatigue:0,priorities:['load','unload','putaway','service'],wage:0}],owned:{},contracts:[{id:'trail',until:15,rating:100}],journal:[],reports:[],events:[],serial:0,nextId:1,openingCash:18000,dayShipped:0,dayOnTime:0,dayMissed:0,workMinutes:{},goods:{arrived:0,shipped:0,scrapped:0,consumed:0,produced:0},parcels:[],serviceJobs:[],serviceDemand:{},cardboard:0,emptyPallets:20,terms:[],records:{pallets:0,cases:0,profit:0},mode,weather:'clear',situation:null,shiftEnd:990};
    if(mode==='sandbox'){s.day=4;s.cash=s.openingCash=2500000;for(const e of O.equipment)if(O.liveEquipment.has(e.id))s.owned[e.id]=1;s.owned.usedLift=0;for(const r of s.map.racks)r.levels=4;}
    if(mode==='peak')s.day=4;
    if(mode==='recall')s.day=4;
    if(mode==='outage')s.day=4;
    return s;
  }
  class Sim {
    constructor(seed=1,mode='normal'){this.s=state(seed,mode);this.reindex();this.schedule();if(mode==='normal'){this.s.trucks[0].arrival=this.s.minute;this.dock();}}
    reindex(){this.occTick=-1;this.occ=null;this.p=new Map(this.s.pallets.map(p=>[p.id,p]));this.t=new Map(this.s.trucks.map(t=>[t.id,t]));}
    id(){return this.s.nextId++;}
    pallet(item,client,cases,truck=null,extra={}){
      const s=this.s,d=O.items[item],p={id:this.id(),sscc:O.labels.sscc(++s.serial),item,client,cases,bookCases:cases,expected:cases,ti:d.ti,hi:d.hi,lot:'L'+s.day.toString().padStart(3,'0'),bestBy:s.day+30+Math.floor(random(s)*40),receivedDay:s.day,x:0,y:0,level:0,place:truck?'trailer':'lane',truckId:truck?.id||null,scanned:false,confirmed:false,hold:false,reservedBy:null,condition:'sound',wrapped:true,labelled:true,...extra};s.pallets.push(p);this.p.set(p.id,p);this.occTick=-1;return p;
    }
    truck(direction,client,appointment,items,order=[],extra={}){
      const s=this.s,t={id:this.id(),direction,client,appointment,arrival:appointment,deadline:direction==='in'?appointment+160:appointment+100,freeMinutes:120,status:'scheduled',door:null,seal:String(45000+Math.floor(random(s)*45000)),expectedSeal:null,checked:false,opened:false,manifest:[],order,loaded:[],receipt:[],departureSeal:null,animation:0,detention:0,kind:'box',...extra};t.expectedSeal=t.seal;
      s.trucks.push(t);this.t.set(t.id,t);
      for(const q of items){const p=this.pallet(q.item,client,q.cases??O.items[q.item].ti*O.items[q.item].hi,t,q);p.index=t.manifest.length;t.manifest.push(p.id);s.goods.arrived+=p.cases;}
      return t;
    }
    schedule(){
      const s=this.s;
      if(s.day<=3&&s.mode==='normal'&&s.contracts.length===1&&s.contracts[0].id==='trail'&&s.contracts[0].until>=s.day){
        this.truck('in','trail',420,[{item:'stove'},{item:'lantern',...(s.day===2?{cases:39,expected:40,bookCases:40,condition:'short'}:{})},{item:'chair'}]);
        this.truck('out','trail',600,[],s.day===1?[{item:'stove',cases:40,full:true}]:[{item:'lantern',cases:12,full:false}]);
        this.truck('in','trail',720,[{item:'lantern'},{item:'stove'},{item:'chair'},{item:'stove'}]);
        this.truck('out','trail',890,[],[{item:'stove',cases:40,full:true},{item:'chair',cases:24,full:true}]);
        return;
      }
      s.serviceDemand={};for(const q of O.services)s.serviceDemand[q.id]=8+Math.floor(s.day/30)*4;
      let slot=425;
      for(const contract of s.contracts){const c=O.client(contract.id);if(contract.until<s.day)continue;
        const stored=s.pallets.filter(p=>p.client===c.id&&p.place==='storage').length;
        const volume=Math.min(26,Math.max(2,c.volume+Math.max(0,Math.floor((s.day-4)/12))+(s.mode==='peak'?4:0)));
        let actual=c.profile==='storage'?Math.max(0,Math.min(volume,80-stored)):volume;
        const parcelOrders=Math.min(24,8+Math.floor(s.day/6));if(c.profile==='parcel')actual=s.pallets.filter(p=>p.client===c.id&&['lane','storage'].includes(p.place)).reduce((a,p)=>a+p.cases*O.items[p.item].pack+(p.openUnits||0),0)<parcelOrders*4?1:0;
        const items=[];for(let i=0;i<actual;i++){const item=c.items[i%c.items.length],d=O.items[item];if(c.profile!=='storage'&&c.profile!=='parcel'){const count=s.pallets.filter(p=>p.client===c.id&&p.item===item&&!['empty','returned','shipped','scrap'].includes(p.place)).reduce((n,p)=>n+p.cases,0)+items.filter(q=>q.item===item).reduce((n,q)=>n+q.cases,0),target=Math.ceil(volume/c.items.length)*(c.profile==='kit'?8*3:d.ti*d.hi*2);if(count>=target)continue;}const discrepancy=s.day>5&&random(s)<.07;items.push({item,cases:(c.profile==='kit'?8:c.profile==='parcel'?Math.ceil(parcelOrders*2/d.pack):d.ti*d.hi)-(discrepancy?1:0),expected:c.profile==='kit'?8:c.profile==='parcel'?Math.ceil(parcelOrders*2/d.pack):d.ti*d.hi,bookCases:c.profile==='kit'?8:c.profile==='parcel'?Math.ceil(parcelOrders*2/d.pack):d.ti*d.hi,condition:discrepancy?'short':'sound'});}
        if(items.length)this.truck('in',c.id,slot,items,[],{kind:actual>12?'semi':'box'});
        const order=[];
        if(c.profile==='storage'){if(stored>15&&s.day%5===0)order.push({item:c.items[0],cases:24,full:true});}
        else if(c.profile==='parcel'){for(const q of s.parcels.filter(q=>q.client===c.id&&q.place==='ready'))order.push({item:q.item,cases:q.units,full:false,parcel:true,orderId:q.orderId});for(let i=0;i<parcelOrders;i++)order.push({item:c.items[0],cases:1+(s.day+i)%3,full:false,parcel:true,orderId:s.day+'-'+i});}
        else if(c.profile==='kit')order.push({item:'kit',cases:8*Math.floor(volume/2),full:false,kit:true});
        else {const n=c.profile==='case'?2:c.profile==='crossdock'?volume:Math.max(2,Math.ceil(volume*.72));for(let i=0;i<n;i++){const item=c.items[(i+s.day)%c.items.length];order.push({item,cases:c.profile==='case'?12:O.items[item].ti*O.items[item].hi,full:c.profile!=='case'});}}
        if(order.length)this.truck('out',c.id,Math.min(860,slot+150),[],order,{deadline:c.profile==='parcel'?960:Math.min(970,slot+360),kind:c.profile==='parcel'?'parcel':order.length>12?'semi':'box'});
        slot+=s.owned.appointments?65:40;
      }
      if(s.day>3&&s.day%3===0&&O.situations?.length){const eligible=O.situations.filter(q=>!q.requires||O.has(s,q.requires));s.situation=copy(eligible[Math.floor(random(s)*eligible.length)]);event(s,s.situation.title+': '+s.situation.text);this.applySituation();}
      const month=Math.floor((s.day-1)/30)%12;s.weather=month===11||month<2?'snow':random(s)<.25?'rain':'clear';
      if(s.mode==='recall'){for(const p of s.pallets.filter(p=>p.place==='storage').slice(0,2))p.hold=true;event(s,'A lot recall. Move held pallets to a hold zone.');}
      if(s.mode==='outage'){s.powerUntil=540;event(s,'Power is out until 9 AM. The hand jack still works.');}
    }
    applySituation(){const s=this.s,q=s.situation,t=s.trucks.find(t=>t.direction==='in');if(!q)return;
      if(q.effect==='seal'&&t)t.seal='BROKEN';
      if(q.effect==='late'&&t)t.arrival+=45;
      if(q.effect==='early'&&t)t.arrival-=30;
      if(q.effect==='damage'&&t){const p=this.p.get(t.manifest[0]);if(p)p.condition='damage';}
      if(q.effect==='hold'){const p=s.pallets.find(p=>p.place==='storage');if(p)p.hold=true;}
      if(q.effect==='outage')s.powerUntil=550;
      if(q.effect==='battery')s.workers[0].battery=Math.min(s.workers[0].battery,25);
      if(q.effect==='rush'){const t=s.trucks.find(t=>t.direction==='out');if(t)t.deadline-=30;}
      if(q.effect==='breakdown')s.machineDown=s.owned.maintenance?15:60;
      if(q.effect==='bonus')O.post(s,'Spot work',12,'Appointment flexibility');
    }
    available(item,client){return (this.assignPool||this.s.pallets).filter(p=>p.item===item&&(!client||p.client===client)&&['lane','storage'].includes(p.place)&&p.confirmed&&!p.hold&&!p.reservedBy&&p.cases>0).sort((a,b)=>O.client(client||a.client).rule==='FEFO'?a.bestBy-b.bestBy||a.id-b.id:a.receivedDay-b.receivedDay||a.id-b.id);}
    occupied(x,y,level=0,except=null){
      const s=this.s,key=(x,y,l)=>x+'/'+y+'/'+l;
      if(this.occTick===-1||!this.occ){this.occTick=s.tick;this.occ=new Map();const add=(x,y,l,id)=>{const k=key(x,y,l);if(!this.occ.has(k))this.occ.set(k,new Set());this.occ.get(k).add(id);};
        for(const p of s.pallets)if(['storage','lane'].includes(p.place)&&(p.cases>0||p.openUnits>0))add(p.x,p.y,p.level,p.id);
        for(const w of s.workers)for(const t of [w.task,...w.queue])if(t?.dest)add(t.dest.x,t.dest.y,t.dest.level||0,t.pallet||-t.id);
      }
      const ids=this.occ.get(key(x,y,level));return !!ids&&[...ids].some(id=>id!==except);
    }
    lane(kind='receiving',p=null){const s=this.s,rect=O.docks.lane(s,kind);
      for(let row=0;row<rect.h;row++)for(let col=0;col<rect.w;col++){const x=O.docks.side(s)==='east'?rect.x+rect.w-1-col:rect.x+col,y=rect.y+rect.h-1-row;if(!O.pathing.blocked(s,x,y)&&!this.occupied(x,y,0,p?.id))return {x,y,level:0,place:'lane',lane:kind};}return this.spot(p);
    }
    spot(p,zone=null){const s=this.s,high=O.has(s,'forklift'),occupied=(x,y,l=0)=>this.occupied(x,y,l,p?.id)||p?.place==='storage'&&p.x===x&&p.y===y&&p.level===l,required=O.client(p?.client)?.requires.find(q=>q==='cold'||q==='cage'),wanted=zone||required||(p?.hold?'hold':'storage'),inside=(z,x,y)=>x>=z.x&&x<z.x+z.w&&y>=z.y&&y<z.y+z.h;
      const racks=s.map.racks.slice().sort((a,b)=>Number(s.map.zones.some(z=>z.type===wanted&&inside(z,b.x,b.y)))-Number(s.map.zones.some(z=>z.type===wanted&&inside(z,a.x,a.y))));
      for(const r of racks)for(let l=0;l<(high?r.levels:1);l++)for(let side=0;side<2;side++){const x=r.x+side,y=r.y;if(occupied(x,y,l)||required&&!s.map.zones.some(z=>z.type===required&&inside(z,x,y))||zone&&!s.map.zones.some(z=>z.type===zone&&inside(z,x,y)))continue;return {x,y,level:l,place:'storage',rack:r.id};}
      return null;
    }
    approach(p){const s=this.s;if(p.place==='trailer'){const t=this.t.get(p.truckId),d=s.map.doors.find(d=>d.id===t.door);return O.docks.slot(s,d,p.index);}
      const rack=s.map.racks.find(r=>p.y===r.y&&p.x>=r.x&&p.x<r.x+2);return {x:p.x,y:p.y+(rack?(O.has(s,'forklift')?2:1):0)};
    }
    reachable(t,p){return !t.manifest.some(id=>{const q=this.p.get(id);return q&&q.place==='trailer'&&q.index<p.index&&Math.floor(q.index/2)<Math.floor(p.index/2);});}
    enqueue(w,t){t.id=this.id();t.phase='source';t.progress=0;t.path=null;w.queue.push(t);if(this.occ&&this.occTick!==-1&&t.dest){const k=t.dest.x+'/'+t.dest.y+'/'+(t.dest.level||0);if(!this.occ.has(k))this.occ.set(k,new Set());this.occ.get(k).add(t.pallet||-t.id);}if(t.pallet)this.p.get(t.pallet).reservedBy=t.id;if(t.output)this.p.get(t.output).reservedBy=t.id;return {ok:true};}
    pending(t,item){return this.s.workers.reduce((n,w)=>n+[w.task,...w.queue].filter(q=>q?.kind==='load'&&q.dest.truck===t.id&&this.p.get(q.pallet)?.item===item).reduce((a,q)=>a+this.p.get(q.pallet).cases,0),0);}
    unassigned(t,line){if(line.parcel)return this.remaining(t,line);const before=t.order.slice(0,t.order.indexOf(line)).filter(l=>l.item===line.item).reduce((a,l)=>a+this.remaining(t,l),0);return Math.max(0,this.remaining(t,line)-Math.max(0,this.pending(t,line.item)-before));}
    release(task){if(task.pallet&&this.p.get(task.pallet)?.reservedBy===task.id)this.p.get(task.pallet).reservedBy=null;if(task.output&&this.p.get(task.output)?.reservedBy===task.id)this.p.get(task.output).reservedBy=null;const job=this.s.serviceJobs.find(q=>q.id===task.job);if(job&&job.status==='queued'){job.status='cancelled';for(const q of job.sources){const p=this.p.get(q.id);p.cases+=q.collected||0;p.bookCases+=q.collected||0;q.collected=0;p.reservedBy=null;}}if(task.kind==='parcelPack'){const line=this.t.get(task.truck)?.order.find(l=>l.orderId===task.orderId);if(line?.reservedBy===task.id)line.reservedBy=null;}if(task.parcel){const q=this.s.parcels.find(q=>q.id===task.parcel);if(q?.reservedBy===task.id)q.reservedBy=null;}this.occTick=-1;}
    clearWork(w){const task=w.task;if(task?.heldUnits){const p=this.p.get(task.pallet),pack=O.items[p.item].pack,total=p.cases*pack+(p.openUnits||0)+task.heldUnits;p.cases=Math.floor(total/pack);p.openUnits=total%pack;p.bookCases=p.cases;task.heldUnits=0;}if(task?.pallet){const p=this.p.get(task.pallet);if(p.place==='transit'){p.place='lane';p.x=Math.round(w.x);p.y=Math.round(w.y);}}if(task?.output){const q=this.p.get(task.output);if(q.place==='transit'){q.place='lane';q.level=0;q.x=Math.round(w.x);q.y=Math.round(w.y);}}if(task?.parcel){const q=this.s.parcels.find(q=>q.id===task.parcel);if(q.place==='transit')q.place='ready';}for(const q of w.queue)this.release(q);if(task)this.release(task);w.queue=[];w.task=null;}
    rackReason(x,y){const s=this.s,aisle=s.owned.narrow?2:3;for(const kind of ['receiving','shipping']){const r=O.docks.lane(s,kind);if(x<r.x+r.w&&x+2>r.x&&y<r.y+r.h&&y+aisle+1>r.y)return 'Keep the receiving and shipping lanes clear.';}if(!Number.isInteger(x)||!Number.isInteger(y)||!O.pathing.inside(s,x,y)||!O.pathing.inside(s,x+1,y+aisle))return 'Leave room for both rack positions and the working aisle inside the building.';if(s.map.racks.some(r=>Math.abs(r.y-y)<aisle+1&&Math.abs(r.x-x)<3))return 'Leave a clear working aisle between racks.';for(let yy=y;yy<=y+aisle;yy++)for(let xx=x;xx<x+2;xx++)if(this.occupied(xx,yy)||O.pathing.blocked(s,xx,yy)||s.map.stations.some(q=>q.x===xx&&q.y===yy)||s.workers.some(w=>Math.round(w.x)===xx&&Math.round(w.y)===yy))return 'Clear the rack and its working aisle first.';return '';}
    command(c){const s=this.s,w=s.workers.find(w=>w.id===(c.worker||1)),p=this.p.get(c.pallet),t=this.t.get(c.truck),fail=reason=>({ok:false,reason});
      if(!w&&['move','walk','pick','wrap','service','charge','count','cancel','priority','reorderTask','removeTask'].includes(c.type))return fail('Choose a known worker.');
      if(c.type==='inspect'){if(!t||t.status!=='docked')return fail('Wait until the truck is at a door.');t.inspected=true;O.noteTerms(s,['Bill of lading','Carrier','Manifest','Delivery receipt']);return {ok:true};}
      if(c.type==='seal'){if(!t||t.status!=='docked'||t.departureRequested||!t.inspected)return fail('Read the paperwork of a waiting truck first.');if(t.seal!==t.expectedSeal)return fail('The seal does not match. Reject the load or record a hold.');t.checked=true;t.opened=true;event(s,'Seal checked. Scan the nearest pallet.','seal');return {ok:true};}
      if(c.type==='reject'){if(!t||t.direction!=='in'||t.departureRequested||!['docked','yard'].includes(t.status))return fail('Select a waiting inbound truck.');for(const id of t.manifest){const p=this.p.get(id);if(p.place==='trailer'){p.place='returned';s.goods.shipped+=p.cases;}}this.requestTruckExit(t);event(s,'Load refused. Client notified.');return {ok:true};}
      if(c.type==='scan'){if(!p)return fail('Select a pallet.');if(p.place==='trailer'){const t=this.t.get(p.truckId);if(!t.opened)return fail('Check the seal first.');if(!this.reachable(t,p))return fail('Unload the rear row first.');}p.scanned=true;O.noteTerms(s,['SSCC','GS1-128','Application identifier','Case count','TI-HI']);event(s,'Label read: '+O.items[p.item].name+'.','scan');return {ok:true};}
      if(c.type==='confirm'){if(!p?.scanned)return fail('Scan the label first.');const count=Number(c.count??p.bookCases);if(!Number.isInteger(count)||count<0||count>200)return fail('Enter a whole case count.');p.bookCases=count;p.confirmed=true;p.recordedCondition=c.condition||'sound';if(c.condition==='damage'){p.hold=true;}
        if(p.truckId)this.t.get(p.truckId).receipt.push({pallet:p.id,expected:p.expected,received:count,condition:c.condition||'sound'});
        if(count!==p.expected||c.condition==='damage'){event(s,(count<p.expected?'Short '+(p.expected-count):count>p.expected?'Over '+(count-p.expected):'Damaged')+' recorded on the receipt.');if(!s.terms.includes('OS&D'))s.terms.push('OS&D');}return {ok:true};}
      if(c.type==='move'){
        if(!p||!['trailer','lane','storage'].includes(p.place)||p.reservedBy)return fail('That pallet is already moving.');if(!p.confirmed)return fail('Scan and confirm its count first.');
        if(p.place==='trailer'&&!this.reachable(this.t.get(p.truckId),p))return fail('Unload the rear row first.');
        let dest=copy(c.dest||{});if(dest.truck){const out=this.t.get(dest.truck);if(!out||out.status!=='docked'||out.departureRequested||out.direction!=='out')return fail('Choose a waiting outbound truck.');if(p.hold)return fail('Held goods cannot ship.');if(O.client(p.client).rule==='FEFO'&&p.bestBy<=s.day)return fail('Expired food cannot ship.');if(!p.wrapped||!p.labelled)return fail('Wrap and label the pick pallet first.');
          const line=out.order.find(l=>l.item===p.item&&this.remaining(out,l)>0);if(p.client!==out.client&&!c.skipScan)return fail('These goods belong to another client.');if(line?.parcel)return fail('Pack individual units at the pack station.');
          if(!line&&!c.skipScan)return fail('Wrong item. The loading scan caught it.');
          if(line&&p.cases>this.remaining(out,line)&&!c.skipScan)return fail('The order needs fewer cases. Build a pick pallet.');
          const open=out.order.filter(l=>!l.parcel&&l.item===p.item).reduce((a,l)=>a+this.remaining(out,l),0)-this.pending(out,p.item);if(p.cases>open&&!c.skipScan)return fail('That order already has its stock assigned.');
          const first=this.available(p.item,p.client).filter(q=>q.id!==p.id)[0];if(line&&first&&!this.businessPlanning&&(O.client(p.client).rule==='FEFO'?first.bestBy<p.bestBy:first.receivedDay<p.receivedDay)&&!c.skipScan)return fail('Use the oldest available stock first.');
          dest={truck:out.id,...O.docks.entrance(s,s.map.doors.find(d=>d.id===out.door)),place:'shipped',skipScan:!!c.skipScan};
        }else{
          if(dest.lane)dest=this.lane(dest.lane,p);
          if(!dest)return fail('No open position. Free a spot or expand.');
          if(!Number.isInteger(dest.x)||!Number.isInteger(dest.y)||!O.pathing.inside(s,dest.x,dest.y))return fail('Choose a position inside the building.');
          const rack=s.map.racks.find(r=>dest.y===r.y&&dest.x>=r.x&&dest.x<r.x+2);dest.rack=rack?.id;dest.level=dest.level||0;dest.place=dest.place||'storage';
          if(!rack&&dest.place!=='lane')return fail('Store pallets in a rack. Click its left or right position.');
          if(dest.place==='lane'){const lane=['receiving','shipping'].includes(dest.lane)&&O.docks.lane(s,dest.lane);if(!lane||dest.level||dest.x<lane.x||dest.x>=lane.x+lane.w||dest.y<lane.y||dest.y>=lane.y+lane.h)return fail('Use the marked Receiving or Shipping staging area.');}
          if(dest.level&&!O.has(s,'forklift'))return fail('Upper levels need a trained forklift operator.');
          if(dest.level&&(!rack||dest.level>=rack.levels))return fail('That level is not installed.');
          if(this.occupied(dest.x,dest.y,dest.level,p.id))return fail('That position is occupied.');
          const required=O.client(p.client).requires.find(q=>q==='cold'||q==='cage');if(dest.place==='storage'&&required&&!s.map.zones.some(z=>z.type===required&&dest.x>=z.x&&dest.x<z.x+z.w&&dest.y>=z.y&&dest.y<z.y+z.h))return fail('This client needs its '+(required==='cold'?'cold room':'secure cage')+'.');
          if(!rack&&O.pathing.blocked(s,dest.x,dest.y))return fail('Keep that aisle clear.');
        }
        const start=this.approach(p),end={x:dest.x,y:dest.y+(dest.rack?(O.has(s,'forklift')?2:1):0)};
        if(!O.pathing.path(s,w,start,O.has(s,'forklift'))||!O.pathing.path(s,start,end,O.has(s,'forklift')))return fail('No clear route. Leave a working aisle.');
        return this.enqueue(w,{kind:dest.place==='shipped'?'load':p.place==='trailer'?'unload':'putaway',pallet:p.id,dest,start,end,duration:1.2});
      }
      if(c.type==='empty'){if(!w||!O.items[c.item||'lantern']||!O.client(c.client||'trail'))return fail('Choose known goods and a worker.');const resting=s.pallets.find(q=>q.pick&&!q.cases&&!q.openUnits&&!q.reservedBy&&!q.hold&&['lane','storage'].includes(q.place));if(resting)return {ok:true,pallet:resting.id};if(s.emptyPallets<1){if(!O.spend(s,'Packaging',2,'Replacement empty pallet'))return fail('An empty pallet costs $2. Free cash before picking.');s.emptyPallets++;}const q=this.pallet(c.item||'lantern',c.client||'trail',0,null,{...O.docks.stack(s),confirmed:true,scanned:true,wrapped:false,labelled:false,pick:true});s.emptyPallets--;return {ok:true,pallet:q.id};}
      if(c.type==='returnEmpty'){if(!p||p.cases||p.openUnits||p.reservedBy||!['lane','storage'].includes(p.place))return fail('Only a resting empty pallet can return to the stack.');p.place='empty';s.emptyPallets++;this.occTick=-1;return {ok:true};}
      if(c.type==='pick'){const output=this.p.get(c.output),count=Number(c.count);if(!p||!p.confirmed||!output?.pick||output.openUnits||p.hold||p.reservedBy||output.reservedBy||p.id===output.id||!['lane','storage'].includes(output.place)||!['lane','storage'].includes(p.place))return fail('Choose available stock and a resting pick pallet.');if(!Number.isInteger(count)||count<1||count>p.cases)return fail('Choose a count you have in stock.');if(output.cases&&(output.item!==p.item||output.client!==p.client))return fail('This pallet has different goods.');const first=this.available(p.item,p.client)[0];if(first&&first.id!==p.id&&(O.client(p.client).rule==='FEFO'?first.bestBy<p.bestBy:first.receivedDay<p.receivedDay))return fail('Pick the oldest available stock first.');const start=this.approach(output),end=this.approach(p);if((p.level||output.level)&&!O.has(s,'forklift'))return fail('Bring upper stock down with a trained forklift first.');if(!O.pathing.path(s,w,start)||!O.pathing.path(s,start,end))return fail('Clear a route from the empty pallet to the source.');output.item=p.item;output.client=p.client;output.receivedDay=output.cases?Math.min(output.receivedDay,p.receivedDay):p.receivedDay;output.bestBy=output.cases?Math.min(output.bestBy,p.bestBy):p.bestBy;output.lot=output.cases&&output.lot!==p.lot?'MIXED':p.lot;output.wrapped=false;output.labelled=false;return this.enqueue(w,{kind:'pick',pallet:p.id,output:output.id,count,start,end,duration:Math.max(1,count*.25/(s.owned.cartonFlow?1.8:s.owned.cart?1.5:1))});}
      if(c.type==='wrap'){if(!p?.pick||p.cases<1||p.reservedBy)return fail('Build a pick pallet first.');return this.enqueue(w,{kind:'wrap',pallet:p.id,start:this.approach(p),end:this.approach(p),duration:s.owned.wrapper?1:3});}
      if(c.type==='count'){if(!p||p.reservedBy)return fail('Choose a resting pallet.');return this.enqueue(w,{kind:'count',pallet:p.id,start:this.approach(p),end:this.approach(p),duration:2});}
      if(c.type==='scrap'){if(!p||p.reservedBy||!['lane','storage'].includes(p.place)||!p.hold)return fail('Only resting held stock can be disposed.');s.goods.scrapped+=p.cases+(p.openUnits||0)/O.items[p.item].pack;p.place='scrap';O.post(s,'Damage',-Math.min(40,p.cases*.5),'Disposed held goods');this.occTick=-1;return {ok:true};}
      if(c.type==='hold'){if(!p||p.reservedBy)return fail('Choose a resting pallet.');p.hold=c.value!==false;return {ok:true};}
      if(c.type==='dispatch'){if(!t||t.direction!=='out'||t.status!=='docked'||t.departureRequested)return fail('Choose a waiting outbound truck.');this.depart(t);O.noteTerms(s,['Outbound handling','Pickup','Cutoff']);return {ok:true};}
      if(c.type==='walk'){const end={x:Math.round(c.x),y:Math.round(c.y)};if(s.trucks.some(t=>t.departureRequested&&['docked','yard','leaving'].includes(t.status)&&this.inTruck(t,end)))return fail('That trailer is closing for departure.');if(!O.pathing.path(s,w,end))return fail('No clear route.');return this.enqueue(w,{kind:'walk',start:end,end,duration:0});}
      if(c.type==='reorderTask'||c.type==='removeTask'){
        const index=w.queue.findIndex(q=>q.id===c.task),task=w.queue[index];if(!task)return fail(w.task?.id===c.task?'That job is already in progress.':"Choose a job in this worker's queue.");
        if(task.exitTruck)return fail('The worker must clear the trailer before other work.');
        if(c.type==='removeTask'){this.release(task);w.queue.splice(index,1);return {ok:true};}
        const position=c.position,first=w.queue.reduce((n,q,i)=>q.exitTruck?i+1:n,0);if(!Number.isInteger(position)||position<first||position>=w.queue.length)return fail('Choose a position after any required trailer exit.');
        w.queue.splice(index,1);w.queue.splice(position,0,task);return {ok:true};
      }
      if(c.type==='cancel'){for(const task of w.queue)if(!task.exitTruck)this.release(task);w.queue=w.queue.filter(q=>q.exitTruck);return {ok:true};}
      if(c.type==='buy'){const reason=O.purchaseReason(s,c.id);if(reason)return fail(reason);if(['robot','autoLift'].includes(c.id)&&s.workers.length>=128)return fail('The warehouse team is full.');if(c.id==='expansion'&&(O.docks.side(s)==='east'?s.map.building.y+s.map.building.h+10:s.map.building.x+s.map.building.w+14)>512)return fail('The site has reached its expansion limit.');if(['bench','assembly','pack','wrapper','baler','repair','line','arm','robot','cage','cold'].includes(c.id)&&2+Math.floor(s.map.stations.length/5)*4>=s.map.building.h)return fail('There is no room for another workstation.');let rackPos=null;if(c.id==='rack'){const b=s.map.building;for(let y=b.y+4;y<b.y+b.h-3&&!rackPos;y+=4)for(let x=b.x+4;x<b.x+b.w-1&&!rackPos;x+=4)if(!this.rackReason(x,y))rackPos={x,y};if(!rackPos)return fail('No room for another rack. Clear its aisle or expand first.');}if(c.id==='door'&&(O.docks.side(s)==='east'?s.map.doors.at(-1).y+5>=s.map.building.y+s.map.building.h:s.map.doors.at(-1).x+5>=s.map.building.x+s.map.building.w))return fail('No wall space for another door. Expand first.');const e=O.equipment.find(e=>e.id===c.id);O.spend(s,c.id==='pallets'?'Packaging':'Purchases',e.cost,e.name);s.owned[c.id]=(s.owned[c.id]||0)+1;const words={training:['Powered industrial truck','Pre-use inspection','Rated capacity'],usedLift:['Counterbalance forklift','Mast','Forks'],lift:['Counterbalance forklift','Mast','Forks'],upper:['Vertical storage','Rack beam'],rack:['Rack bay','Rack upright','Ground position'],pack:['Unit pick','Case pack','Parcel','Pack station'],bench:['Kitting','Bill of materials','Work order'],zones:['Putaway','Location','Slotting'],cold:['FEFO','Cold room','Lot','Best-by date'],crossdock:['Cross-dock'],yard:['Yard','Drop trailer'],baler:['Disposition'],assembly:['WIP','Cycle time','Bottleneck'],labeler:['Relabeling','Label verification']};O.noteTerms(s,words[c.id]||[]);
        if(c.id==='pallets')s.emptyPallets+=10;
        if(c.id==='upper')for(const r of s.map.racks)r.levels=4;
        if(c.id==='rack')s.map.racks.push({id:this.id(),...rackPos,levels:s.owned.upper?4:1});
        if(c.id==='door'){const last=s.map.doors.at(-1);s.map.doors.push({id:this.id(),x:last.x+(O.docks.side(s)==='east'?0:4),y:last.y+(O.docks.side(s)==='east'?4:0)});}
        if(c.id==='expansion'){const b=s.map.building;if(O.docks.side(s)==='east'){b.h+=8;s.map.h=Math.max(s.map.h,b.y+b.h+2);}else{b.w+=8;s.map.w=Math.max(s.map.w,b.x+b.w+6);}}
        if(c.id==='secondBuilding'){s.map.building.w+=12;s.map.w+=12;}
        if(['bench','assembly','pack','wrapper','baler','repair','line','arm','robot','cage','cold'].includes(c.id))s.map.stations.push({id:c.id,x:s.map.building.x+2+(s.map.stations.length%5)*4,y:s.map.building.y+2+Math.floor(s.map.stations.length/5)*4});
        if(c.id==='robot'||c.id==='autoLift')this.addWorker({name:c.id==='robot'?'Mover '+s.owned.robot:'Auto lift',role:'robot',wage:3,color:'#9eaeb0'});
        if(c.id==='cold'||c.id==='cage'){const b=s.map.building;s.map.zones.push({x:c.id==='cold'?b.x+b.w-6:b.x+1,y:c.id==='cold'?b.y+2:b.y+7,w:4,h:4,type:c.id});}
        if(c.id==='secondShift')s.shiftEnd=1260;
        s.map.revision++;return {ok:true};}
      if(c.type==='contract'){if(s.day===1&&s.phase!=='evening')return fail('Choose clients after your first shift.');const client=O.client(c.id);if(!client)return fail('Unknown client.');if(c.decline){s.contracts=s.contracts.filter(q=>q.id!==c.id);return {ok:true};}const old=s.contracts.find(q=>q.id===c.id);if(!old&&s.reputation<client.rep)return fail('Build your service record first.');if(client.requires.some(r=>!O.has(s,r)))return fail('Requires '+client.requires.join(', ')+'.');if(old){old.until=s.day+client.days;}else s.contracts.push({id:c.id,until:s.day+client.days,rating:100});return {ok:true};}
      if(c.type==='hire'){if(s.workers.length>=128)return fail('The warehouse team is full.');if(!O.has(s,'forklift'))return fail('Buy the forklift before hiring.');if(!Number.isInteger(c.index)||c.index<0||c.index>=O.staff.length)return fail('Choose a person from the hiring board.');const person=O.staff[c.index];if(!O.spend(s,'Purchases',75,'Recruiting '+person.name))return fail('Not enough cash.');this.addWorker({...person,name:person.name+(s.workers.length>4?' '+s.workers.length:'')});return {ok:true};}
      if(c.type==='dismiss'){if(!w||w.role==='player'||w.role==='robot')return fail('Choose a hired person.');if(w.task&&s.phase==='shift')return fail('Let the current job finish before dismissal.');this.clearWork(w);if(s.phase==='shift')O.post(s,'Wages',-w.wage*(s.owned.secondShift?1.5:1),w.name+' final shift wages');s.workers=s.workers.filter(q=>q.id!==w.id);event(s,w.name+' has left the team.');return {ok:true};}
      if(c.type==='priority'){if(!w)return fail('Unknown worker.');if(!['load','unload','putaway','service'].includes(c.kind))return fail('Unknown job.');w.priorities=w.priorities.filter(q=>q!==c.kind);w.priorities.unshift(c.kind);return {ok:true};}
      if(c.type==='build'){if(s.day===1&&s.phase!=='evening')return fail('Build mode opens after your first shift.');const x=Math.round(c.x),y=Math.round(c.y),b=s.map.building;if(!O.pathing.inside(s,x,y))return fail('Build inside the warehouse.');if(this.occupied(x,y)||this.occupied(x+1,y)||s.workers.some(w=>Math.round(w.x)===x&&Math.round(w.y)===y))return fail('Clear the work area first.');
        if(c.kind==='zone'){if(!s.owned.zones)return fail('Buy putaway zones first.');s.map.zones.push({x,y,w:Math.max(1,Math.min(c.w||4,b.x+b.w-x)),h:Math.max(1,Math.min(c.h||3,b.y+b.h-y)),type:c.zone||'storage',client:c.client||null});}
        else if(c.kind==='rack'){const reason=this.rackReason(x,y);if(reason)return fail(reason);if(!O.spend(s,'Purchases',55,'Placed rack'))return fail('Not enough cash.');s.map.racks.push({id:this.id(),x,y,levels:s.owned.upper?4:1});}
        else if(c.kind==='remove'){if(s.pallets.some(p=>p.place==='storage'&&p.y===y&&p.x>=x&&p.x<x+2))return fail('Empty every rack level before removing it.');s.map.racks=s.map.racks.filter(r=>r.x!==x||r.y!==y);s.map.zones=s.map.zones.filter(r=>r.x!==x||r.y!==y);}
        else return fail('Choose racks or zones.');s.map.revision++;return {ok:true};}
      if(c.type==='service'){const service=O.services.find(q=>q.id===c.id);if(!service||!O.liveEquipment.has(service.requires)||!O.has(s,service.requires))return fail('Install the service station first.');const requested=Number(c.units??8);if(!Number.isInteger(requested)||requested<1||requested>20)return fail('Choose one to twenty cases.');const units=requested,station=s.map.stations.find(q=>q.id===service.requires)||{x:7,y:6};const sources=[];
        const already=s.serviceJobs.filter(j=>j.service===service.id&&j.status!=='cancelled').reduce((a,j)=>a+j.units,0);
        let demand=(s.serviceDemand?.[service.id]||8)-already;
        if(['kit','assembly'].includes(service.id)){
          const orders=s.trucks.filter(t=>t.direction==='out'&&t.client==='lumen'&&!['gone','leaving'].includes(t.status)).reduce((a,t)=>a+t.order.filter(l=>l.item==='kit').reduce((a,l)=>a+this.remaining(t,l),0),0);
          const made=s.pallets.filter(p=>p.item==='kit'&&p.client==='lumen'&&['lane','storage','transit'].includes(p.place)).reduce((a,p)=>a+p.cases,0);
          demand=orders-made-s.serviceJobs.filter(j=>['kit','assembly'].includes(j.service)&&j.status==='queued').reduce((a,j)=>a+j.units,0);
        }
        if(demand<units)return fail('No work order for that many cases.');if(!O.pathing.path(s,w,station))return fail('Clear a route to the service station.');
        for(const [item,n]of Object.entries(service.inputs)){let remaining=n*units;for(const p of this.available(item,['kit','assembly'].includes(service.id)?'lumen':service.id==='ticket'?'linen':null).filter(p=>p.level===0)){const count=Math.min(remaining,p.cases);if(count){sources.push({id:p.id,count,collected:0});remaining-=count;}if(!remaining)break;}if(remaining)return fail('Need '+(n*units)+' floor-level cases of '+O.items[item].name+'.');}
        let from=w;for(const q of sources){const at=this.approach(this.p.get(q.id));if(!O.pathing.path(s,from,at)||!O.pathing.path(s,at,station))return fail('Clear a route between the components and bench.');from=at;}
        const job={id:this.id(),service:service.id,units,sources,status:'queued'};s.serviceJobs.push(job);for(const q of sources)this.p.get(q.id).reservedBy=job.id;return this.enqueue(w,{kind:'service',job:job.id,serviceIndex:0,gatherProgress:0,start:this.approach(this.p.get(sources[0].id)),end:{x:station.x,y:station.y},duration:service.seconds*units/(s.owned.line?2:1)});
      }
      if(c.type==='cancelService'){const job=s.serviceJobs.find(q=>q.id===c.job&&q.status==='queued');if(!job)return fail('That work order has already closed.');for(const worker of s.workers){if(worker.task?.job===job.id){this.release(worker.task);worker.task=null;return {ok:true};}const index=worker.queue.findIndex(q=>q.job===job.id);if(index!==-1){this.release(worker.queue[index]);worker.queue.splice(index,1);return {ok:true};}}return fail('No worker has that work order.');}
      if(c.type==='charge'){if(!O.has(s,'forklift'))return fail('No forklift to charge.');return this.enqueue(w,{kind:'charge',start:{x:7,y:21},end:{x:7,y:21},duration:s.owned.charger?3:8});}
      if(c.type==='nextDay'){if(s.phase!=='evening')return fail('Finish the current shift first.');this.nextDay();return {ok:true};}
      return fail('Unknown command.');
    }
    addWorker(person){const s=this.s;s.workers.push({id:this.id(),...person,...O.docks.spawn(s),queue:[],task:null,path:[],equipment:person.role==='driver'||person.role==='robot'?'forklift':'jack',battery:100,fatigue:0,priorities:person.role==='maker'?['service','putaway','load','unload']:person.role==='receiver'?['unload','putaway','load','service']:person.role==='loader'?['load','unload','putaway','service']:['putaway','load','unload','service']});}
    remaining(t,line){if(line.parcel&&line.orderId)return Math.max(0,line.cases-t.loaded.filter(q=>q.orderId===line.orderId).reduce((a,q)=>a+q.cases,0));const index=t.order.indexOf(line),before=t.order.slice(0,index).filter(l=>l.item===line.item).reduce((a,l)=>a+l.cases,0),loaded=t.loaded.filter(q=>q.item===line.item).reduce((a,q)=>a+q.cases,0);return Math.max(0,line.cases-Math.max(0,loaded-before));}
    requestTruckExit(t){if(t.departureRequested)return;t.departureRequested=true;t.closingTick=null;
      const matches=q=>q&&(q.truck===t.id||q.dest?.truck===t.id||q.kind==='walk'&&this.inTruck(t,q.end)||q.pallet&&t.manifest.includes(q.pallet)&&this.p.get(q.pallet)?.place==='returned');
      for(const w of this.s.workers){const kept=w.queue.filter(q=>!matches(q));for(const q of w.queue)if(matches(q))this.release(q);w.queue=[];if(matches(w.task)){const p=w.task?.pallet&&this.p.get(w.task.pallet),parcel=w.task?.parcel&&this.s.parcels.find(q=>q.id===w.task.parcel);this.clearWork(w);if(p?.place==='lane'){const lane=this.lane('shipping',p)||this.lane('receiving',p);if(lane)Object.assign(p,lane);}if(parcel){const station=this.s.map.stations.find(q=>q.id==='pack')||{x:7,y:6};Object.assign(parcel,{x:station.x+1,y:station.y});}}w.queue=kept;}
    }
    inTruck(t,w){const d=this.s.map.doors.find(q=>q.id===t.door);if(!d)return false;const east=O.docks.side(this.s)==='east',length=t.kind==='semi'?13:t.kind==='parcel'?4:7;return east?w.x>=d.x-.5&&w.x<=d.x+length+1&&w.y>=d.y-.5&&w.y<d.y+2:w.y>=d.y-.5&&w.y<=d.y+length+1&&w.x>=d.x-.5&&w.x<d.x+2;}
    truckWorkers(t){return this.s.workers.filter(w=>this.inTruck(t,w));}
    clearTruckExit(t){const s=this.s,workers=this.truckWorkers(t),d=s.map.doors.find(q=>q.id===t.door);if(workers.length){t.closingTick=null;for(const w of workers)if(!w.task){const end=O.docks.side(s)==='east'?{x:d.x-1,y:d.y}:{x:d.x,y:d.y-1};if(!w.queue.some(q=>q.exitTruck===t.id)){const kept=w.queue;w.queue=[];this.enqueue(w,{kind:'walk',exitTruck:t.id,start:end,end,duration:0});w.queue.push(...kept);}}return;}
      if(t.closingTick===null){t.closingTick=s.tick;t.opened=false;event(s,'Worker clear. Trailer doors closing.','truck-close');}
      if((s.tick-t.closingTick)*DT>=.7){t.status='leaving';t.animation=0;event(s,t.direction==='in'?'Receipt signed. Receiving truck released.':'Driver pulling away from the dock.','departure');}
    }
    depart(t){const s=this.s;if(!['docked','yard'].includes(t.status)||t.departureRequested)return;this.requestTruckExit(t);t.departureSeal=String(50000+Math.floor(random(s)*40000));
      const missing=t.order.reduce((a,l)=>a+this.remaining(t,l),0),wrong=t.loaded.filter(q=>q.client&&q.client!==t.client||!t.order.some(l=>l.item===q.item)).reduce((a,q)=>a+q.cases,0);
      const requested=t.order.reduce((a,l)=>a+l.cases,0),fraction=requested?Math.max(0,(requested-missing-wrong)/requested):1,complete=!missing&&!wrong;
      if(!complete){O.post(s,'Chargebacks',-Math.min(90,missing*.6+wrong*1.5),'Short or wrong shipment');s.dayMissed++;}else s.dayOnTime++;
      const contract=s.contracts.find(c=>c.id===t.client);if(contract){const q=contract.quality=contract.quality||{trucks:0,complete:0,requested:0,filled:0,wrong:0};q.trucks++;q.complete+=Number(complete);q.requested+=requested;q.filled+=requested*fraction;q.wrong+=wrong;const score=75*(q.requested?q.filled/q.requested:1)+25*q.complete/q.trucks;contract.rating=65+.55*score;s.reputation=Math.max(20,Math.min(100,s.reputation*.97+score*.03));}

      event(s,missing?'Releasing truck '+missing+' cases short.':'Order complete. Preparing the truck for departure.','release');
    }
    dock(){const s=this.s;for(const t of s.trucks){
      if(t.status==='scheduled'&&s.minute>=t.arrival&&(!t.deliveryDay||t.deliveryDay<=s.day)){t.status='arriving';t.animation=0;event(s,(t.direction==='in'?'Inbound':'Outbound')+' truck is arriving.','truck');}
      if(t.status==='arriving'){t.animation+=DT;if(t.animation>=4)t.status='yard';}
      if(t.status==='yard'&&!t.departureRequested){const door=s.map.doors.find(d=>!s.trucks.some(q=>q.door===d.id&&['docked','leaving'].includes(q.status)));if(door){t.door=door.id;t.status='docked';t.animation=0;for(const id of t.manifest){const p=this.p.get(id);Object.assign(p,O.docks.slot(s,door,p.index));}event(s,'Door '+(s.map.doors.indexOf(door)+1)+': '+(t.direction==='in'?'check the seal.':'order ready.'),'dock');}}
      if(t.status==='leaving'){t.animation+=DT;if(t.animation>=6)t.status='gone';}
      if(['docked','yard'].includes(t.status)&&s.minute>t.arrival+t.freeMinutes){const due=Math.floor((s.minute-t.arrival-t.freeMinutes)/15);if(due>t.detention){O.post(s,'Detention',-(due-t.detention)*4,'Carrier waiting');t.detention=due;}}
      if(['docked','yard'].includes(t.status)&&t.direction==='out'&&s.minute>=t.deadline)this.depart(t);
      if(t.status==='docked'&&t.direction==='in'&&!t.manifest.some(id=>this.p.get(id).place==='trailer'))this.requestTruckExit(t);
      if(t.departureRequested&&['docked','yard'].includes(t.status))this.clearTruckExit(t);
    }}
    assign(){const s=this.s;this.assignPool=s.pallets.filter(p=>['lane','storage'].includes(p.place)&&(p.cases>0||p.openUnits>0));const staged=this.assignPool.filter(p=>p.place==='lane'&&!p.pick);for(const w of s.workers.slice(1)){if(w.task||w.queue.length)continue;if(s.minute>990&&!s.owned.secondShift)continue;
      for(const priority of w.priorities){let found=false;
        if(priority==='unload'&&w.role!=='robot'){const t=s.trucks.find(t=>t.direction==='in'&&t.status==='docked'&&!t.departureRequested&&t.seal===t.expectedSeal);if(t){t.inspected=true;t.checked=true;t.opened=true;const p=t.manifest.map(id=>this.p.get(id)).find(p=>p.place==='trailer'&&!p.reservedBy&&this.reachable(t,p));if(p){p.scanned=true;this.command({type:'confirm',pallet:p.id,count:p.cases,condition:p.condition==='damage'?'damage':'sound'});found=this.command({type:'move',pallet:p.id,dest:{lane:'receiving'},worker:w.id}).ok;}}}
        if(priority==='load'){const t=s.trucks.find(t=>t.direction==='out'&&t.status==='docked'&&!t.departureRequested);if(t){for(const l of t.order){if(l.parcel)continue;const left=this.unassigned(t,l);if(left<=0)continue;const stock=this.available(l.item,t.client),p=stock.find(p=>p.cases<=left&&p.wrapped);if(p)found=this.command({type:'move',pallet:p.id,dest:{truck:t.id},worker:w.id}).ok;
          if(!found&&w.role!=='robot'){const built=stock.find(p=>p.pick&&!p.wrapped&&p.cases<=left);if(built)found=this.command({type:'wrap',pallet:built.id,worker:w.id}).ok;else{const source=stock.find(p=>p.wrapped);if(source){const q=this.command({type:'empty',item:source.item,client:source.client,worker:w.id});if(q.ok)found=this.command({type:'pick',pallet:source.id,output:q.pallet,count:Math.min(source.cases,left),worker:w.id}).ok;}}}if(found)break;}if(t.order.every(l=>!this.remaining(t,l)))this.depart(t);}}

        if(priority==='putaway'&&(s.owned.zones||w.role==='driver'||w.role==='robot')){const p=staged.find(p=>!p.reservedBy);if(p){const dest=this.spot(p);if(dest)found=this.command({type:'move',pallet:p.id,dest,worker:w.id}).ok;}}
        if(priority==='service'&&w.role==='maker'&&s.owned.bench){const type=s.owned.assembly?'assembly':'kit',t=s.trucks.find(t=>t.client==='lumen'&&t.direction==='out'&&!['gone','leaving'].includes(t.status));if(t){const need=t.order.reduce((a,l)=>a+this.remaining(t,l),0)-s.pallets.filter(p=>p.item==='kit'&&p.client==='lumen'&&['lane','storage','transit'].includes(p.place)).reduce((a,p)=>a+p.cases,0)-s.serviceJobs.filter(j=>j.status==='queued').reduce((a,j)=>a+j.units,0);if(need>0)found=this.command({type:'service',id:type,units:Math.min(8,need),worker:w.id}).ok;}}
        if(found)break;
      }
    }this.assignPool=null;}
    finish(w,task){this.occTick=-1;const s=this.s,p=this.p.get(task.pallet);
      if(task.kind==='salePick'){const out=this.p.get(task.output);Object.assign(out,task.dest);out.wrapped=false;out.labelled=false;}
      else if(task.kind==='pick'){const out=this.p.get(task.output);const n=Math.min(task.count,p.cases);p.cases-=n;p.bookCases=Math.max(0,p.bookCases-n);out.cases+=n;out.bookCases+=n;out.x=Math.round(w.x);out.y=Math.round(w.y);out.place='lane';out.level=0;if(!p.cases&&!p.openUnits){p.place='empty';s.emptyPallets++;}}
      else if(task.kind==='wrap'){p.wrapped=true;p.labelled=true;O.post(s,'Wrap and labels',2.5,'Wrapped pick pallet');event(s,'Wrapped and labelled. Ready to load.','wrap');}
      else if(task.kind==='count'){p.bookCases=p.cases;p.confirmed=true;event(s,'Count corrected: '+p.cases+' cases.');}
      else if(task.kind==='charge'){w.battery=100;event(s,'Battery charged.');}
      else if(task.kind==='service'){
        const job=s.serviceJobs.find(j=>j.id===task.job),service=O.services.find(q=>q.id===job.service);if(s.machineDown>0){task.progress=Math.max(0,task.progress-DT);return false;}
        let consumed=0;for(const q of job.sources){const source=this.p.get(q.id);consumed+=q.collected;q.collected=0;source.reservedBy=null;if(!source.cases&&!source.openUnits){source.place='empty';s.emptyPallets++;}}
        s.goods.consumed+=consumed;const output=this.pallet(service.output,service.id==='kit'||service.id==='assembly'?'lumen':this.p.get(job.sources[0].id).client,job.units,null,{confirmed:true,scanned:true,x:w.x+1,y:w.y,pick:true});s.goods.produced+=job.units;job.status='done';job.output=output.id;O.post(s,'Services',service.fee*job.units,service.name);s.cardboard+=consumed;event(s,job.units+' '+service.name+' finished.','service');
      }
      else if(task.kind!=='walk'){
        const d=task.dest;
        if(d.place==='shipped'){const t=this.t.get(d.truck);if(t.status!=='docked'||t.departureRequested){const lane=this.lane('shipping',p);Object.assign(p,lane);event(s,'The truck left. Pallet returned to the shipping lane.');}else{
          p.place='shipped';p.truckId=t.id;t.loaded.push({pallet:p.id,item:p.item,client:p.client,cases:p.cases,scanned:!d.skipScan});s.goods.shipped+=p.cases;s.dayShipped+=p.cases;s.records.pallets++;s.records.cases+=p.cases;
          const c=O.client(t.client),line=t.order.find(l=>l.item===p.item),rate=(s.contracts.find(q=>q.id===c.id)?.rating||100)/100;
          O.post(s,line?.parcel?'Parcel':'Shipping',(line?.full?c.ship:c.ship+p.cases*c.cases)*rate,'Loaded '+O.items[p.item].name);
          if(c.profile==='crossdock')O.post(s,'Cross-dock',4,'Same-day transfer');
        }}else{const was=p.place;Object.assign(p,d);p.truckId=null;if(was==='transit'&&task.kind==='unload'){O.post(s,'Receiving',O.client(p.client).receive,'Received '+O.items[p.item].name);s.cardboard+=p.cases*.15;}event(s,task.kind==='unload'?(d.place==='storage'?'Received and stored in the rack.':'Pallet in the receiving lane.'):'Pallet put away.','setdown');}
      }
      if(p)p.reservedBy=null;if(task.output)this.p.get(task.output).reservedBy=null;return true;
    }
    collectService(w,t){const s=this.s,job=s.serviceJobs.find(j=>j.id===t.job),q=job.sources[t.serviceIndex];if(!q){t.phase='dest';t.progress=0;return;}
      const p=this.p.get(q.id);if(p.hold||p.cases<q.count||p.reservedBy!==job.id){this.release(t);w.task=null;event(s,'Component stock is unavailable. Work order stopped.');return;}
      t.gatherProgress+=DT;if(t.gatherProgress<Math.max(.5,q.count*.2))return;
      p.cases-=q.count;p.bookCases=Math.max(0,p.bookCases-q.count);q.collected=q.count;t.serviceIndex++;t.gatherProgress=0;this.occTick=-1;
      const next=job.sources[t.serviceIndex],dest=next?this.approach(this.p.get(next.id)):t.end;if(!next)t.phase='dest';t.path=O.pathing.path(s,w,dest);
      if(!t.path){this.release(t);w.task=null;event(s,'Route blocked. Components returned to stock.');}
    }
    work(w){const s=this.s;if(!w.task&&w.queue.length){w.task=w.queue.shift();w.task.path=O.pathing.path(s,w,w.task.start,O.has(s,'forklift'));if(!w.task.path){event(s,'Aisle blocked. Replan the move.');this.release(w.task);w.task=null;return;}}
      const t=w.task;if(!t)return;
      if(t.kind==='service'&&s.serviceJobs.find(j=>j.id===t.job).sources.some(q=>this.p.get(q.id).hold)){this.release(t);w.task=null;event(s,'Component stock is on hold. Work order stopped.');return;}
      s.workMinutes[t.kind]=(s.workMinutes[t.kind]||0)+DT;
      const lift=t.kind!=='service'&&O.has(s,'forklift')&&!(s.powerUntil>s.minute)&&(w.id===1||w.role==='driver'||w.role==='robot'),speed=lift?(s.owned.reach?6.4:5.5):s.owned.walkie?4.6:3.2;
      if(lift&&w.battery<=0&&t.kind!=='charge'){w.battery=1;event(s,'Low battery. Finishing this move with the hand jack.');}
      if(t.path?.length){const next=t.path[0],dx=next.x-w.x,dy=next.y-w.y,dist=Math.hypot(dx,dy),move=speed*DT*(lift&&w.battery>2?1:.65);w.angle=Math.atan2(dy,dx);if(dist<=move){w.x=next.x;w.y=next.y;t.path.shift();}else{w.x+=dx/dist*move;w.y+=dy/dist*move;}
        const key=Math.round(w.y)*s.map.w+Math.round(w.x);if(s.tick%10===0)s.map.wear[key]=(s.map.wear[key]||0)+1;
        if(t.phase==='dest'&&t.parcel){const q=s.parcels.find(q=>q.id===t.parcel);q.x=w.x;q.y=w.y;}
        if(t.output&&(t.phase==='dest'&&['pick','salePick'].includes(t.kind)||t.kind==='salePick'&&t.sourceIndex>0)){const q=this.p.get(t.output);q.x=w.x;q.y=w.y;}
        if(t.phase==='dest'&&t.pallet&&!['parcelPack','pick','salePick'].includes(t.kind)){const p=this.p.get(t.pallet);p.x=w.x;p.y=w.y;}
        if(lift)w.battery=Math.max(0,w.battery-DT*.025);return;
      }
      if(t.phase==='source'&&t.kind==='salePick'){this.collectSale(w,t);return;}
      if(t.phase==='source'&&t.kind==='pick'){const q=this.p.get(t.output);q.place='transit';q.level=0;q.x=w.x;q.y=w.y;this.occTick=-1;t.phase='dest';t.path=O.pathing.path(s,w,t.end,lift);if(!t.path){this.clearWork(w);event(s,'Route blocked. Pick pallet staged safely.');}return;}
      if(t.phase==='source'&&t.kind==='parcelPack'){const p=this.p.get(t.pallet),pack=O.items[p.item].pack,total=p.cases*pack+(p.openUnits||0)-t.units;p.cases=Math.floor(total/pack);p.openUnits=total%pack;p.bookCases=p.cases;t.heldUnits=t.units;t.phase='dest';t.path=O.pathing.path(s,w,t.end);return;}
      if(t.phase==='source'&&t.kind==='parcelLoad'){const q=s.parcels.find(q=>q.id===t.parcel);q.place='transit';t.phase='dest';t.path=O.pathing.path(s,w,t.end);return;}
      if(t.phase==='source'&&['load','unload','putaway'].includes(t.kind)){const p=this.p.get(t.pallet);p.place='transit';this.occTick=-1;t.phase='dest';t.path=O.pathing.path(s,w,t.end,lift);if(!t.path){p.place='lane';p.reservedBy=null;w.task=null;event(s,'Route blocked. Pallet staged safely.');}return;}
      if(t.kind==='service'&&t.phase==='source'){this.collectService(w,t);return;}
      if(t.kind==='service'&&s.machineDown>0)return;
      t.progress+=DT;
      if(t.progress>=t.duration&&this.finish(w,t)){w.task=null;w.fatigue=Math.min(1,w.fatigue+DT*.002);}
    }
    tick(advanceClock=true){const s=this.s;if(s.phase!=='shift')return;s.tick++;if(advanceClock)s.minute+=DT*CLOCK;this.dock();if(s.tick%10===0)this.assign();for(const w of s.workers)this.work(w);if(s.machineDown>0)s.machineDown-=DT;
      if(s.owned.conveyor&&s.tick%40===0){const t=s.trucks.find(t=>t.direction==='out'&&t.status==='docked');if(t){const p=s.pallets.find(p=>p.place==='lane'&&p.lane==='shipping'&&!p.reservedBy&&t.order.some(l=>l.item===p.item&&this.remaining(t,l)>=p.cases));if(p)this.command({type:'move',pallet:p.id,dest:{truck:t.id},worker:s.workers.find(w=>w.role==='robot')?.id||1});}}
      if(s.minute>=s.shiftEnd){for(const t of s.trucks)if(t.direction==='out'&&['docked','yard'].includes(t.status))this.depart(t);if(!s.trucks.some(t=>t.departureRequested&&['docked','yard','leaving'].includes(t.status))&&(s.mode!=='business'||!s.workers.some(w=>w.task||w.queue.length)))O.settle(s);}
    }
    step(n=1){for(let i=0;i<n;i++)this.tick();return this.s;}
    nextDay(){const s=this.s;
      // Finish staged work safely rather than carrying transient reservations over a night.
      for(const w of s.workers){this.clearWork(w);w.battery=100;w.fatigue=0;}
      for(const job of s.serviceJobs.filter(j=>j.status==='queued'))for(const q of job.sources){const p=this.p.get(q.id);if(p)p.reservedBy=null;}
      for(const p of s.pallets)if(p.place==='trailer'){p.place='returned';s.goods.shipped+=p.cases;}
      for(const q of s.parcels){if(q.place==='transit')q.place='ready';q.reservedBy=null;}s.parcels=s.parcels.filter(q=>q.place!=='shipped');
      s.pallets=s.pallets.filter(p=>!['shipped','returned','empty'].includes(p.place));s.trucks=[];s.serviceJobs=[];s.journal=s.journal.filter(e=>e.day>=s.day-60);s.day++;for(const p of s.pallets)if(O.client(p.client).rule==='FEFO'&&p.bestBy<=s.day)p.hold=true;s.minute=415;s.phase='shift';s.openingCash=s.cash;s.dayShipped=0;s.dayOnTime=0;s.dayMissed=0;s.workMinutes={};s.situation=null;s.powerUntil=0;
      this.reindex();this.schedule();event(s,s.day===4?"From here, it's your warehouse.":'Day '+s.day+'. The first truck is on its way.');
    }
    hash(){const json=JSON.stringify(this.s);let h=2166136261;for(let i=0;i<json.length;i++)h=Math.imul(h^json.charCodeAt(i),16777619);return (h>>>0).toString(16);}
    snapshot(){return copy(this.s);}
    restore(s){this.s=copy(s);this.s.parcels=this.s.parcels||[];this.s.serviceDemand=this.s.serviceDemand||{};this.reindex();for(const w of this.s.workers)for(const t of [w.task,...w.queue].filter(q=>q?.kind==='service'))if(t.serviceIndex===undefined){const job=this.s.serviceJobs.find(j=>j.id===t.job);for(const q of job.sources)q.collected=0;t.serviceIndex=0;t.gatherProgress=0;t.start=this.approach(this.p.get(job.sources[0].id));t.phase='source';t.path=w.task===t?O.pathing.path(this.s,w,t.start):null;t.progress=0;if(w.task===t&&!t.path){this.release(t);w.task=null;}}}

    reconcile(){const s=this.s;const onHand=s.pallets.filter(p=>!['shipped','returned','scrap','empty'].includes(p.place)).reduce((a,p)=>a+p.cases+(p.openUnits||0)/O.items[p.item].pack,0)+(s.parcels||[]).filter(q=>q.place!=='shipped').reduce((a,q)=>a+q.units/O.items[q.item].pack,0)+s.workers.reduce((a,w)=>a+(w.task?.heldUnits||0)/(O.items[this.p.get(w.task?.pallet)?.item]?.pack||1),0);const materials=s.serviceJobs.filter(j=>j.status==='queued').reduce((a,j)=>a+j.sources.reduce((n,q)=>n+(q.collected||0),0),0);return {expected:s.goods.arrived+s.goods.produced,accounted:onHand+materials+s.goods.shipped+s.goods.scrapped+s.goods.consumed,onHand:onHand+materials};}
  }
  O.Sim=Sim;O.DT=DT;O.CLOCK=CLOCK;
})(typeof globalThis !== 'undefined' ? globalThis : window);
