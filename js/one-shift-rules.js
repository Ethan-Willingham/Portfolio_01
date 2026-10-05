(function(root){
 'use strict';const O=root.OneShift,P=O.Sim.prototype,command=P.command,assign=P.assign;
 P.command=function(c){const s=this.s,fail=reason=>({ok:false,reason});
  if(c.type==='assignTask'){const worker=s.workers.find(w=>w.id===c.worker),owner=s.workers.find(w=>w.queue.some(t=>t.id===c.task));if(!worker||!owner||worker.role==='robot')return fail('Choose queued work and a person.');const task=owner.queue.splice(owner.queue.findIndex(t=>t.id===c.task),1)[0];worker.queue.push(task);return {ok:true};}
  if(c.type==='pickFace'){if(!s.owned.pickFace)return fail('Install pick faces first.');const r=s.map.racks.find(r=>r.id===c.rack),side=Number(c.side||0),min=Number(c.min??8),max=Number(c.max??40);if(!r||!O.items[c.item]||!O.client(c.client)||!Number.isInteger(side)||side<0||side>1||!Number.isInteger(min)||!Number.isInteger(max)||min<0||max<=min||max>200)return fail('Choose a rack position, client, item and valid minimum and maximum.');s.pickFaces=s.pickFaces||[];s.pickFaces=s.pickFaces.filter(q=>q.rack!==r.id||q.side!==side);s.pickFaces.push({rack:r.id,side,item:c.item,client:c.client,min,max});O.noteTerms(s,['Pick face','Min-max','Replenishment','Reserve storage']);return {ok:true};}
  if(c.type==='wave'){const t=this.t.get(c.truck);if(!s.owned.waves||!t||t.direction!=='out'||['gone','leaving'].includes(t.status))return fail('Choose an upcoming outbound wave.');t.released=c.value!==false;O.noteTerms(s,['Order consolidation','Cutoff']);return {ok:true};}
  const r=command.call(this,c);if(r.ok&&c.type==='buy'&&c.id==='pickFace'){const rack=s.map.racks[0];s.pickFaces=[{rack:rack.id,side:0,item:'lantern',client:'trail',min:8,max:40}];}return r;
 };
 P.assign=function(){const s=this.s;if(s.owned.pickFace)for(const face of s.pickFaces||[]){const r=s.map.racks.find(r=>r.id===face.rack);if(!r)continue;const x=r.x+face.side,rest=s.pallets.find(p=>p.place==='storage'&&p.x===x&&p.y===r.y&&p.level===0),stock=rest?.cases||0;if(stock>face.min||rest?.reservedBy)continue;
   const worker=s.workers.find(w=>w.role==='driver'&&!w.task&&!w.queue.length);if(!worker)continue;const reserve=this.available(face.item,face.client).find(p=>p.level>0&&p.cases>face.min&&p.cases<=face.max);if(!reserve)continue;
   // Replenishment swaps a depleted pallet out before bringing reserve down.
   if(rest&&rest.cases>0){const dest=this.spot(rest);if(dest)this.command({type:'move',pallet:rest.id,dest,worker:worker.id});}
   else this.command({type:'move',pallet:reserve.id,dest:{x,y:r.y,level:0},worker:worker.id});
  }
  if(s.owned.waves)for(const t of s.trucks.filter(t=>t.direction==='out'&&t.status==='scheduled'&&t.released)){for(const line of t.order){if(line.parcel)continue;const staged=s.pallets.filter(p=>p.stagedFor===t.id&&['lane','transit'].includes(p.place)).reduce((a,p)=>a+(p.item===line.item?p.cases:0),0);const need=t.order.filter(l=>l.item===line.item).reduce((a,l)=>a+l.cases,0);if(staged>=need)continue;const w=s.workers.find(w=>w.role==='loader'&&!w.task&&!w.queue.length);if(!w)break;const p=this.available(line.item,t.client).find(p=>p.wrapped&&p.stagedFor!==t.id&&p.cases<=need-staged);if(!p)continue;const q=this.command({type:'move',pallet:p.id,dest:{lane:'shipping'},worker:w.id});if(q.ok)p.stagedFor=t.id;}}
  assign.call(this);
 };
})(typeof globalThis!=='undefined'?globalThis:window);
