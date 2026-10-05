(function(root){
 'use strict';const O=root.OneShift,P=O.UI.prototype,el=id=>document.getElementById('shift-'+id),esc=s=>String(s).replace(/[&<>"']/g,q=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[q]));
 const action=(label,name,task,disabled=false)=>'<button data-action="queue-'+name+'" data-id="'+task.id+'" aria-label="'+esc(label+' '+task.title)+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
 P.initQueue=function(){this.queueWorker=1;this.queueOpen=null;this.queueLayout();document.addEventListener('change',event=>{if(event.target.id==='shift-queue-worker'){this.queueWorker=Number(event.target.value);this.selectionKey='';this.update();}});};
 P.queueLayout=function(){const compact=innerWidth<1050||innerHeight<=550,open=this.queueOpen??!compact;el('queue').dataset.open=String(open);el('queue').querySelector('[data-action="queue-toggle"]').setAttribute('aria-expanded',String(open));};
 P.queueTask=function(task){const sim=this.app.sim,p=sim.p.get(task.pallet),q=sim.s.parcels.find(q=>q.id===task.parcel),item=p?O.items[p.item].name:q?O.items[q.item].name:'',dest=task.dest,truck=sim.t.get(dest?.truck||task.truck),door=truck?.door&&sim.s.map.doors.findIndex(d=>d.id===truck.door)+1;
  let title=({unload:'Receive pallet',putaway:'Put away',load:'Load truck',pick:'Pick cases',wrap:'Wrap and label',count:'Count stock',charge:'Charge forklift',parcelPack:'Pack parcel',parcelLoad:'Load parcel',walk:task.exitTruck?'Clear the trailer':'Walk to position',service:'Bench work'})[task.kind]||'Warehouse work',detail=item;
  if(task.kind==='service'){const job=sim.s.serviceJobs.find(j=>j.id===task.job),service=O.services.find(q=>q.id===job?.service);title=service?.name||title;detail=job?job.units+' finished cases':'';}
  if(task.kind==='putaway'&&dest?.lane)title='Stage pallet';
  if(task.kind==='pick')detail=task.count+' cases / '+item;
  if(task.kind==='parcelPack')detail=task.units+' units / '+item+' at Pack station';
  if(dest?.place==='storage')detail+=' to '+this.position({...dest,place:'storage'});
  else if(dest?.lane)detail+=' to '+(dest.lane==='receiving'?'Receiving':'Shipping');
  else if(truck&&task.kind!=='parcelPack')detail+=' to '+(door?'Door '+door:O.client(truck.client).name);
  else if(task.kind==='walk')detail=task.exitTruck?'Required before truck departure':'Floor '+task.end.x+', '+task.end.y;
  return {id:task.id,title,detail:detail.trim()};
 };
 P.queueStatus=function(task){if(!task)return this.app.paused?'Paused for planning':'Ready for a job';if(this.app.paused)return 'Paused / '+(task.path?.length?'walking':'working');if(task.exitTruck)return 'Walking clear of the trailer';if(task.path?.length)return task.phase==='source'?'Walking to the job':'Taking goods to the destination';if(task.duration)return 'Working / '+Math.min(100,Math.floor(task.progress/task.duration*100))+'%';return 'Finishing the move';};
 P.renderQueue=function(){const app=this.app,s=app.sim.s,panel=el('queue');panel.hidden=app.hubPause;this.queueLayout();const workers=s.workers.filter(w=>w.role!=='robot');if(!workers.some(w=>w.id===this.queueWorker))this.queueWorker=1;const w=workers.find(w=>w.id===this.queueWorker)||s.workers[0],current=w.task&&this.queueTask(w.task),pending=w.queue.map(t=>this.queueTask(t));
  el('queue-summary').textContent=w.queue.length+' waiting'+(w.task?' / 1 active':app.paused?' / paused':'');
  const first=w.queue.reduce((n,t,i)=>t.exitTruck?i+1:n,0),key=JSON.stringify([s.day,w.id,workers.map(w=>[w.id,w.name]),current,pending,first,app.paused]);
  if(key!==this.queueKey){this.queueKey=key;const body=el('queue-body'),scroll=body.scrollTop,focus=body.contains(document.activeElement)?{action:document.activeElement.dataset.action,id:document.activeElement.dataset.id,select:document.activeElement.id==='shift-queue-worker'}:null;
   let html=workers.length>1?'<label class="shift-queue-worker">Worker<select id="shift-queue-worker">'+workers.map(q=>'<option value="'+q.id+'" '+(q.id===w.id?'selected':'')+'>'+esc(q.name)+'</option>').join('')+'</select></label>':'<p class="shift-kicker">'+esc(w.name)+' / YOUR WORKER</p>';
   html+='<button class="shift-queue-plan '+(app.paused?'primary':'')+'" data-action="queue-plan" aria-pressed="'+app.paused+'">'+(app.paused?'Run queue':'Pause to plan')+'</button><p class="shift-queue-help">'+(app.paused?'Choose pallets and destinations while time is paused. Run queue when ready.':'Your clicks add jobs below. Pause to plan several moves.')+'</p><section class="shift-queue-current" aria-label="Current job"><span class="shift-kicker">NOW</span><strong>'+esc(current?.title||'No active job')+'</strong>'+(current?'<p>'+esc(current.detail)+'</p>':'')+'<small id="shift-queue-status"></small></section><div class="shift-queue-next"><span class="shift-kicker">UP NEXT / '+pending.length+'</span><button data-action="queue-clear" '+(!w.queue.some(t=>!t.exitTruck)?'disabled':'')+'>Clear planned</button></div>';
   html+=pending.length?'<ol class="shift-queue-jobs" aria-label="Planned jobs in order">'+pending.map((q,i)=>'<li data-queue-task="'+q.id+'"><div class="shift-queue-job"><span class="shift-queue-number">'+(i+1)+'</span><div><strong>'+esc(q.title)+'</strong><p>'+esc(q.detail)+'</p></div></div>'+(w.queue[i].exitTruck?'<small>Required trailer exit</small>':'<div class="shift-queue-actions">'+action('Up','up',q,i<=first)+action('Down','down',q,i===pending.length-1)+action('Remove','remove',q)+'</div>')+'</li>').join('')+'</ol>':'<p class="shift-queue-empty">No jobs waiting. Select a pallet, then choose where it should go.</p>';
   body.innerHTML=html;body.scrollTop=scroll;if(focus){const node=focus.select?el('queue-worker'):Array.from(body.querySelectorAll('button')).find(q=>q.dataset.action===focus.action&&q.dataset.id===focus.id&&!q.disabled);(node||body.querySelector('[data-action="queue-plan"]'))?.focus({preventScroll:true});}
  }
  el('queue-status').textContent=this.queueStatus(w.task);
 };
 const original=P.action;
 P.action=function(node){const name=node.dataset.action;if(!name?.startsWith('queue-'))return original.call(this,node);const app=this.app,w=app.sim.s.workers.find(w=>w.id===this.queueWorker),id=Number(node.dataset.id);
  if(name==='queue-toggle'){const r=app.renderer,fit=r.homeCamera&&['x','y','zoom'].every(k=>Math.abs(r.camera[k]-r.homeCamera[k])<.001);this.queueOpen=el('queue').dataset.open!=='true';this.queueLayout();if(fit)r.home(app.sim.s);}
  else if(name==='queue-plan')app.paused=!app.paused;
  else if(name==='queue-clear')this.issue({type:'cancel',worker:w.id});
  else if(name==='queue-remove')this.issue({type:'removeTask',task:id,worker:w.id});
  else if(name==='queue-up'||name==='queue-down'){const index=w.queue.findIndex(t=>t.id===id);this.issue({type:'reorderTask',task:id,worker:w.id,position:index+(name==='queue-up'?-1:1)});}
  this.update();app.renderer.draw(app.sim.s,this);
 };
})(window);
