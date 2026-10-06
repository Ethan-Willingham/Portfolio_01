(function(root){
  'use strict';
  const O=root.OneShift,P=O.UI.prototype,el=id=>document.getElementById('shift-'+id);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const btn=(text,action,extra='',primary=false)=>'<button data-action="business-'+action+'" '+extra+' class="'+(primary?'primary':'')+'">'+text+'</button>';
  const orderValue=o=>o.lines.reduce((n,l)=>n+l.cases*l.price,0);
  const legacy={update:P.update,selection:P.selection,renderQueue:P.renderQueue,queueLayout:P.queueLayout,renderHub:P.renderHub,action:P.action,guideActive:P.guideActive,drawGuide:P.drawGuide,settingsMenu:P.settingsMenu};
  function goal(s){const c=s.commerce;
    if(!c.completed)return {text:'First sale',n:0,max:1};
    if(!c.restocked)return {text:'First restock',n:0,max:1};
    if(c.completed<8)return {text:'Unlock radios',n:c.completed,max:8};
    if(c.completed<20)return {text:'Unlock notebooks',n:c.completed,max:20};
    if(c.completed<50)return {text:'50 deliveries',n:c.completed,max:50};
    return {text:c.won?'Established':'$3,000 net worth',n:Math.floor(O.businessAssets(s)/100),max:3000};
  }
  function preserveHTML(node,html){if(node._businessHTML===html)return;node._businessHTML=html;
    const focused=node.contains(document.activeElement)?{...document.activeElement.dataset}:null,scroll=node.scrollTop;
    node.innerHTML=html;node.scrollTop=scroll;
    if(focused){const next=Array.from(node.querySelectorAll('button')).find(b=>!b.disabled&&Object.keys(focused).every(k=>b.dataset[k]===focused[k]));next?.focus({preventScroll:true});}
  }
  P.guideActive=function(){return O.business(this.app.sim.s)?this.app.sim.s.commerce.firstDecision:legacy.guideActive.call(this);};
  P.queueLayout=function(){if(!O.business(this.app.sim.s)){el('queue').classList.remove('shift-business-rail','is-first');el('queue').querySelector('[data-action="queue-toggle"] strong').textContent='Work queue';return legacy.queueLayout.call(this);}const panel=el('queue');panel.classList.add('shift-business-rail');panel.dataset.open=String(this.queueOpen!==false);panel.querySelector('[data-action="queue-toggle"]').setAttribute('aria-expanded',String(this.queueOpen!==false));};
  P.businessStockHTML=function(){const sim=this.app.sim,s=sim.s,c=s.commerce,capacity=sim.businessCapacity(),size=this.stockSize||16;
    let html='<div class="shift-stock-top"><span>'+capacity.used+' / '+capacity.slots+' slots</span>'+btn('Rack $55','buy','data-id="rack" '+(O.purchaseReason(s,'rack')?'disabled':''))+'</div><div class="shift-stock-sizes" role="group" aria-label="Purchase size">'+[8,16,32].map(n=>btn(n+' cases','size','data-id="'+n+'" aria-pressed="'+(size===n)+'"')).join('')+'</div>';
    for(const item of O.unlockedGoods(s)){
      const surplus=sim.surplusQuote(item);
      const d=O.catalog[item],q=sim.restockQuote(item,size),stock=sim.businessStock(item),remaining=c.orders.filter(o=>['future','offered'].includes(o.status)).reduce((n,o)=>n+o.lines.filter(l=>l.item===item).reduce((n,l)=>n+l.cases,0),0),credit=q.credit?'<small class="shift-credit">Credit '+O.price(q.credit)+'</small>':'';
      html+='<article class="shift-stock-card" data-stock="'+item+'"><div><strong>'+d.name+'</strong><span>'+stock.free+' ready'+(stock.incoming?' / '+stock.incoming+' incoming':'')+'</span></div><small>'+ (s.phase==='evening'?'Sell '+O.price(d.sell)+'/case':remaining+' needed today')+' / '+O.price(q.unitCost)+'/case</small>'+btn('Buy '+size+' / '+O.price(q.cost),'restock','data-item="'+item+'" data-count="'+size+'" '+(q.reason?'disabled aria-label="'+esc(d.name+': '+q.reason)+'"':''),true)+'<small>'+esc(q.reason||('Arrives '+(s.phase==='evening'||s.minute+q.lead>=s.shiftEnd-20?'tomorrow':O.time(s.minute+q.lead))))+'</small>'+credit+(s.phase==='shift'&&surplus?'<details><summary>Surplus</summary>'+btn('Sell '+surplus.count+' / '+O.price(surplus.value),'surplus','data-item="'+item+'"')+'<small>70% of cost</small></details>':'')+'</article>';
    }
    if(s.credit)html+='<p class="shift-credit">Credit used '+O.money(s.credit/100)+' / $500</p>';
    for(const [item,d]of Object.entries(O.catalog).filter(([id,d])=>c.completed<d.unlock))html+='<article class="shift-stock-card is-locked" data-stock="'+item+'"><div><strong>'+d.name+'</strong></div><small>'+d.unlock+' orders to unlock</small><button disabled>Buy</button></article>';
    return html;
  };
  P.renderQueue=function(){const app=this.app,sim=app.sim,s=sim.s;if(!O.business(s))return legacy.renderQueue.call(this);
    const c=s.commerce,panel=el('queue');panel.hidden=app.hubPause;panel.classList.toggle('is-first',c.firstDecision);this.queueLayout();el('intro').hidden=true;panel.classList.remove('has-guide');document.body.classList.remove('shift-guided');
    const queued=c.queue.map(id=>c.orders.find(o=>o.id===id)).filter(Boolean),offered=c.orders.filter(o=>o.status==='offered'),tab=this.businessTab||'orders',g=goal(s);
    panel.querySelector('[data-action="queue-toggle"] strong').textContent='Orders';el('queue-summary').textContent=[queued.length?queued.length+' queued':'',offered.length?offered.length+' new':''].filter(Boolean).join(' / ')||'Clear';
    let html='<div class="shift-business-goal"><strong>'+esc(g.text)+'</strong><span>'+Math.min(g.n,g.max)+' / '+g.max+'</span><progress value="'+g.n+'" max="'+g.max+'"></progress></div><nav class="shift-business-tabs" aria-label="Warehouse board">'+['orders','stock','work'].map(id=>btn(({orders:'Orders',stock:'Stock',work:'Worker'})[id],'tab','data-id="'+id+'" aria-pressed="'+(id===tab)+'"')).join('')+'</nav>';
    if(tab==='stock')html+=this.businessStockHTML();
    else if(tab==='work'){
      const w=s.workers.find(w=>w.id===this.queueWorker)||s.workers[0];
      html+='<label class="shift-queue-worker">Worker<select id="shift-queue-worker">'+s.workers.map(w=>'<option value="'+w.id+'" '+(w.id===this.queueWorker?'selected':'')+'>'+esc(w.name)+'</option>').join('')+'</select></label>';
      html+='<section class="shift-business-job"><strong>'+esc(w.task?.kind==='salePick'?'Pick '+w.task.count+' cases':w.task?this.queueTask(w.task).title:'Ready')+'</strong>'+(!w.task?'<p>Choose an order.</p>':'')+btn(app.paused?'Run':'Pause','pause','',app.paused)+'</section>';
      html+=w.queue.length?'<ol class="shift-queue-jobs">'+w.queue.map(t=>'<li><strong>'+esc(t.kind==='salePick'?'Pick '+t.count+' cases':this.queueTask(t).title)+'</strong></li>').join('')+'</ol>':'';
    }else{
      for(const o of [...queued,...offered]){
        const t=sim.t.get(o.truck),loaded=t?.loaded.reduce((n,l)=>n+l.cases,0)||0,total=o.lines.reduce((n,l)=>n+l.cases,0),missing=o.lines.find(l=>sim.businessStock(l.item).free<l.cases),i=c.queue.indexOf(o.id);
        html+='<article class="shift-order-card '+(o.rush?'rush':'')+'" data-order="'+o.id+'"><header><strong>'+esc(o.customer)+'</strong><span>'+O.price(orderValue(o))+'</span></header><small>'+(o.rush?'RUSH / ':'')+'Due '+O.time(o.due)+'</small><div class="shift-order-lines">'+o.lines.map(l=>'<span><b>'+l.cases+'</b> '+O.catalog[l.item].name+'</span>').join('')+'</div>';
        if(o.status==='offered')html+=missing?btn('Restock '+O.catalog[missing.item].name,'need-stock','data-item="'+missing.item+'"',true):btn('Ship order','fulfill','data-id="'+o.id+'"',true);
        else{
          const work=s.workers.find(w=>w.task?.businessOrder===o.id),label=loaded?'Loading '+loaded+' / '+total:work?.task?.kind==='salePick'?'Picking':work?.task?.kind==='wrap'?'Wrapping':t?.status==='yard'?'Waiting for dock':'Queued';
          html+='<div class="shift-order-progress"><span>'+label+'</span><progress value="'+loaded+'" max="'+total+'"></progress></div><div class="shift-order-actions">'+btn('Up','priority','data-id="'+o.id+'" data-direction="-1" '+(i===0?'disabled':''))+btn('Down','priority','data-id="'+o.id+'" data-direction="1" '+(i===c.queue.length-1?'disabled':''))+btn('Cancel','cancel','data-id="'+o.id+'" '+(loaded?'disabled':''))+'</div>';
        }html+='</article>';
      }
      const future=c.orders.find(o=>o.status==='future');
      if(!queued.length&&!offered.length)html+='<div class="shift-orders-idle"><strong>'+(future?'Next / '+O.time(future.arrival):'No more orders')+'</strong></div>';
      if(future&&!queued.length&&!offered.length)html+=btn('Next order','advance','',true);
      if(!future&&!queued.length&&!offered.length&&s.phase==='shift')html+=btn('Finish shift','finish','',true);
      const sold=c.orders.filter(o=>o.status==='complete');if(sold.length)html+='<p class="shift-sold-summary">'+sold.length+' sold / '+O.money(sold.reduce((n,o)=>n+o.paid,0)/100)+'</p>';
    }
    preserveHTML(el('queue-body'),html);
  };
  P.selection=function(){const sim=this.app.sim,s=sim.s;if(!O.business(s))return legacy.selection.call(this);const node=el('selection'),hit=this.target;
    if(!hit){node.hidden=true;return;}
    const p=sim.p.get(hit.id),t=sim.t.get(hit.id),r=s.map.racks.find(r=>r.id===hit.id&&hit.kind==='rack');let html='<button class="close" data-action="close">Close</button>';
    if(p&&['pallet','putaway'].includes(hit.kind)){
      html+='<p class="shift-kicker">'+esc(p.place==='storage'?this.position(p):p.place==='trailer'?'DELIVERY':p.businessOrder?'ORDER STOCK':'STOCK')+'</p><h2>'+O.catalog[p.item]?.name+'</h2><strong>'+p.cases+' cases</strong><p>'+ (p.reservedBy?'Moving':p.businessOrder||sim.claimedCases(p.id)?'Reserved':p.place==='trailer'?'Unloading':'Available')+'</p>';
      if(p.place==='lane'&&!p.reservedBy&&!p.businessOrder)html+=btn('Choose rack','putaway','data-id="'+p.id+'"');
      if(hit.kind==='putaway')html+='<div class="shift-storage-chooser">'+this.rackPositions(p).map(q=>this.storageButton(q)).join('')+'</div>';
      html+='<details><summary>Stock details</summary><p>Lot '+esc(p.lot)+' / received day '+p.receivedDay+'</p><p>Cost '+O.price(p.unitCost||0)+'/case</p><canvas class="shift-label" aria-label="Pallet barcode"></canvas></details>';
    }else if(t&&hit.kind==='truck'){
      const o=s.commerce.orders.find(o=>o.id===t.businessOrder);html+='<p class="shift-kicker">'+(t.supplier?'SUPPLIER':'CUSTOMER')+'</p><h2>'+esc(o?.customer||'Stock delivery')+'</h2><p>'+esc(t.departureRequested?'Departing':t.supplier?'Unloading':'Loading')+'</p><div class="shift-order-lines">'+(t.supplier?t.manifest.map(id=>sim.p.get(id)).filter(Boolean):t.order).map(l=>'<span>'+l.cases+' '+O.catalog[l.item]?.name+'</span>').join('')+'</div>';
    }else if(r){html+='<p class="shift-kicker">STORAGE</p><h2>Rack A'+r.id+'</h2>';for(const q of this.rackPositions(null,[r]))html+='<p>'+ (q.side?'Right':'Left')+' / '+(q.stock?q.stock.cases+' '+O.catalog[q.stock.item]?.name:'Empty')+'</p>';}
    else{node.hidden=true;return;}node.hidden=false;preserveHTML(node,html);this.barcode(p||{});
  };
  P.update=function(){const app=this.app,s=app.sim.s;if(!O.business(s)){const was=document.body.classList.contains('shift-business');document.body.classList.remove('shift-business');if(was){this.queueOpen=null;this.queueKey=null;el('queue-body')._businessHTML=null;el('selection')._businessHTML=null;el('hub')._businessHTML=null;el('toolbar')._businessHTML=null;el('toolbar').innerHTML=Object.entries({contracts:'Contracts',shop:'Shop',build:'Build',people:'People',services:'Services',reports:'Reports'}).map(([id,label])=>'<button data-hub="'+id+'">'+label+'</button>').join('');}return legacy.update.call(this);}document.body.classList.add('shift-business');if(this.businessState!==s){this.businessState=s;el('queue-body')._businessHTML=null;el('selection')._businessHTML=null;el('hub')._businessHTML=null;this.businessTab='orders';this.businessNotice=null;this.queueOpen=true;}
    el('day').textContent='DAY '+s.day;el('clock').textContent=O.time(s.minute);el('money').textContent=O.money(s.cash/100);el('pause').textContent=app.paused?'Run':'Pause';el('pause').setAttribute('aria-pressed',String(app.paused));
    const toolbar=el('toolbar');toolbar.hidden=false;preserveHTML(toolbar,'<button data-hub="shop">Store</button>');
    const start=480,end=s.shiftEnd;el('timeline').innerHTML=s.commerce.orders.map(o=>'<i class="out '+(['complete','missed','cancelled'].includes(o.status)?'gone':'')+'" style="left:'+Math.max(0,Math.min(100,(o.arrival-start)/(end-start)*100))+'%"></i>').join('')+'<b style="left:'+Math.max(0,Math.min(100,(s.minute-start)/(end-start)*100))+'%"></b>';
    el('next-truck').hidden=true;this.selection();el('hint').hidden=true;
    if(this.build){el('hint').textContent='Click to place a rack.';el('hint').hidden=false;}
    if(performance.now()>this.toastUntil)el('toast').hidden=true;
    const recent=s.events.findLast(e=>['sale','purchase','restock','milestone'].includes(e.kind));if(recent&&recent!==this.businessNotice)this.toast(recent.text);this.businessNotice=recent;
    if(s.phase==='evening'&&this.lastPhase!=='evening'){this.target=null;this.selected=[];this.openHub('reports');if(!app.preview)O.saves.save(s);}this.lastPhase=s.phase;
    this.renderQueue();
  };
  P.renderHub=function(){const sim=this.app.sim,s=sim.s;if(!O.business(s))return legacy.renderHub.call(this);this.renderQueue();const tab=this.hubTab||'reports',evening=s.phase==='evening';el('hub').hidden=false;
    let html='<header><div class="shift-store-balance"><span>CASH</span><strong>'+O.money(s.cash/100)+'</strong></div><div class="shift-store-title"><p class="shift-kicker">DAY '+s.day+'</p><h2>'+(tab==='reports'?'Shift complete':'Store')+'</h2></div><button data-action="'+(evening?'next':'hub-close')+'" class="'+(evening?'primary':'')+'">'+(evening?'Day '+(s.day+1):'Back')+'</button></header>';
    if(tab!=='reports')html+='<nav aria-label="Store sections">'+['shop','stock','people','build'].map(id=>'<button data-hub="'+id+'" aria-pressed="'+(tab===id)+'" '+(id==='people'&&!O.has(s,'forklift')?'disabled title="Unlock with a forklift"':'')+'>'+({stock:'Stock',shop:'Equipment',people:'Team',build:'Layout'})[id]+'</button>').join('')+'</nav>';
    if(tab==='stock')html+='<div class="shift-business-stock-hub">'+this.businessStockHTML()+'</div>';
    else if(tab==='reports'){
      const r=s.reports.at(-1),today=s.commerce.orders.filter(o=>o.status==='complete'),sales=today.reduce((n,o)=>n+o.paid,0),cogs=s.commerce.orders.reduce((n,o)=>n+o.cogs,0),cost=s.journal.filter(e=>e.day===s.day&&e.cents<0&&!['Inventory','Purchases','Credit'].includes(e.category)).reduce((n,e)=>n-e.cents,0),profit=evening?r?.profit||0:sales-cogs-cost;
      html+='<div class="shift-business-results"><div><span>PROFIT</span><strong>'+O.money(profit/100)+'</strong></div><div><span>SOLD</span><strong>'+today.length+'</strong></div><div><span>CASH</span><strong>'+O.money(s.cash/100)+'</strong></div></div><div class="shift-business-next"><strong>'+s.commerce.completed+' total orders</strong><span>Net worth '+O.money(O.businessAssets(s)/100)+'</span></div>';
      if(evening)html+='<div class="shift-actions"><button data-hub="stock">Restock</button><button data-hub="shop">Store</button></div>';
      html+='<details><summary>Ledger</summary><dl class="shift-ledger">'+Object.entries(r?.day===s.day?r.by:{Sales:sales,'Stock sold':-cogs,Expenses:-cost}).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+O.money(v/100)+'</dd>').join('')+'</dl><p>'+s.dayMissed+' missed / '+Math.round(s.reputation)+'% service</p></details>';
    }else if(tab==='shop'){
      const descriptions={rack:'+2 pallet slots',walkie:'Faster moves',cart:'+50% picking speed',wrapStand:'Unlocks wrapper',wrapper:'1-second wrapping',training:'Operator training',usedLift:'Faster moves and hiring',lift:'Faster moves and hiring',upper:'4 rack levels',door:'2 trucks at once',expansion:'More floor space',maintenance:'Forklift upkeep',charger:'Faster charging'};
      html+='<div class="shift-grid">';for(const id of O.businessUpgrades){const e=O.equipment.find(e=>e.id===id),reason=O.purchaseReason(s,id),installed=reason==='Already installed.';html+='<article class="shift-card '+(reason?'is-locked':'')+'" data-equipment="'+id+'"><h3>'+e.name+'</h3><p>'+descriptions[id]+'</p>'+btn(installed?'Installed':'Buy / '+O.money(e.cost),'buy','data-id="'+id+'" '+(reason?'disabled':''),!reason)+(reason&&!installed?'<small>'+esc(reason)+'</small>':'<small class="shift-card-status">'+(installed?'':'Available')+'</small>')+'</article>';}html+='</div>';
    }else if(tab==='people'){
      html+='<div class="shift-grid">';for(const w of s.workers.slice(1))html+='<article class="shift-card"><h3>'+esc(w.name)+'</h3><p>'+O.money(w.wage)+' / day</p><button data-action="dismiss" data-id="'+w.id+'" '+(w.task&&!evening?'disabled':'')+'>Dismiss</button></article>';for(const [i,p]of O.staff.entries())html+='<article class="shift-card"><h3>'+esc(p.name)+'</h3><p>'+O.money(p.wage)+' / day</p><button data-action="hire" data-id="'+i+'" '+(!O.has(s,'forklift')||s.cash<7500?'disabled':'')+'>Hire / $75</button></article>';html+='</div>';
    }else if(tab==='build')html+='<div class="shift-actions"><button data-action="build-rack">Rack / $55</button><button data-action="share">Copy layout</button></div><p id="shift-share-result"></p>';
    preserveHTML(el('hub'),html);
  };
  P.action=function(node){const app=this.app,sim=app.sim,s=sim.s,name=node.dataset.action;if(!O.business(s)||!name?.startsWith('business-'))return legacy.action.call(this,node);
    const action=name.slice(9),id=Number(node.dataset.id);
    if(action==='surplus'){this.issue({type:'sellSurplus',item:node.dataset.item});this.businessTab='orders';}
    else if(action==='tab'||action==='need-stock'){this.businessTab=action==='need-stock'?'stock':node.dataset.id;this.queueOpen=true;}
    else if(action==='size'){this.stockSize=id;if(app.hubPause)this.renderHub();}
    else if(action==='fulfill')this.issue({type:'fulfill',order:id});
    else if(action==='cancel')this.issue({type:'cancelOrder',order:id});
    else if(action==='priority')this.issue({type:'orderPriority',order:id,direction:Number(node.dataset.direction)});
    else if(action==='restock'){this.issue({type:'restock',item:node.dataset.item,count:Number(node.dataset.count)});if(app.hubPause)this.renderHub();}
    else if(action==='buy'){this.issue({type:'buy',id:node.dataset.id});if(app.hubPause)this.renderHub();}
    else if(action==='pause')app.paused=!app.paused;
    else if(action==='putaway'){this.target={kind:'putaway',id};this.selected=[id];}
    else if(action==='advance'){
      const next=s.commerce.orders.find(o=>o.status==='future');if(next){const limit=next.arrival;let ticks=0;while(s.phase==='shift'&&s.minute<limit&&ticks++<20000)sim.tick();}
    }else if(action==='finish'){let ticks=0;while(s.phase==='shift'&&ticks++<20000)sim.tick();}
    this.update();app.renderer.draw(s,this);
  };
  P.settingsMenu=function(){const s=this.app.sim.s;if(!O.business(s))return legacy.settingsMenu.call(this);const d=el('settings');this.app.menuPause=true;
    let html='<header class="shift-menu-head"><h2 id="shift-settings-title">One Shift</h2><button class="primary" data-action="menu-close">Resume</button></header><label>Volume<input data-setting="volume" type="range" min="0" max="1" step=".05" value="'+this.settings.volume+'"></label><label>Interface<input data-setting="scale" type="range" min=".85" max="1.3" step=".05" value="'+this.settings.scale+'"></label><details><summary>Accessibility</summary><label>Reduced motion<input data-setting="reducedMotion" type="checkbox" '+(this.settings.reducedMotion?'checked':'')+'></label><label>Color marks<input data-setting="colorblind" type="checkbox" '+(this.settings.colorblind?'checked':'')+'></label></details><h3>Save game</h3>';
    for(let i=1;i<=3;i++){const info=O.saves.info(i);html+='<div class="shift-save-row"><span>'+i+' / '+(info?'Day '+info.day:'Empty')+'</span><button data-action="save" data-id="'+i+'">Save</button><button data-action="load" data-id="'+i+'" '+(!info?'disabled':'')+'>Load</button></div>';}
    html+='<p class="shift-menu-note">Reload starts fresh. Load a save to continue.</p><details><summary>More</summary><div class="shift-menu-actions"><button data-action="export">Export</button><button data-action="import">Import</button><button data-action="new" data-id="business">New game</button></div><input type="file" id="shift-import" accept="application/json,.json" hidden><a href="archive.html">Leave game</a></details><details><summary>Controls</summary><p>Right-drag or WASD to pan. Wheel or + / - to zoom. Space to pause. Workers move for tasks.</p>';
    for(const [action,key]of Object.entries(this.settings.keys))html+='<label>'+esc(action.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase()))+'<input type="text" maxlength="12" data-key="'+esc(action)+'" value="'+esc(key)+'"></label>';
    d.innerHTML=html+'</details>';if(!d.open)d.showModal();d.querySelector('button').focus();
  };
  P.drawGuide=function(renderer){const s=this.app.sim.s;if(!O.business(s))return legacy.drawGuide?.call(this,renderer);
    const g=renderer.g,z=renderer.camera.zoom,plates=[];
    for(const r of s.map.racks){
      const ps=s.pallets.filter(p=>p.place==='storage'&&p.cases>0&&p.y===r.y&&p.x>=r.x&&p.x<r.x+2),quantities={};
      for(const p of ps)quantities[p.item]=(quantities[p.item]||0)+p.cases;
      const compact=z<18,at=renderer.screen(r.x+1,compact?r.y+2.6:r.y-1.05);
      if(at.x<0||at.x>renderer.w-20||at.y<84||at.y>renderer.h-50)continue;
      Object.entries(quantities).forEach(([item,count],i)=>{
        const name=compact?({stove:'Stove',lantern:'Lantern',chair:'Chair',radio:'Radio',notebook:'Notebook'}[item]||O.catalog[item]?.name):O.catalog[item]?.name;
        const size=compact?Math.min(9,2.8*z/(name.length*.6)):10,label=name+' '+count,y=at.y+i*(compact?30:17);
        g.font=size+'px "Commit Mono",monospace';const width=g.measureText(compact?name:label).width+(compact?4:10),height=compact?27:16;
        const box={x:at.x-width/2,y:y-10,w:width,h:height};
        if(plates.some(p=>box.x<p.x+p.w+2&&box.x+box.w+2>p.x&&box.y<p.y+p.h&&box.y+box.h>p.y))return;
        plates.push(box);g.fillStyle='#182530';g.fillRect(box.x,box.y,box.w,box.h);
        renderer.text(g,compact?name:label,at.x,y-2,size,'#edf2f6','center','middle');
        if(compact)renderer.text(g,String(count),at.x,y+10,size,'#edf2f6','center','middle');
      });
    }
    const sale=s.events.findLast(e=>e.kind==='sale'&&s.tick-e.tick<50);if(sale){renderer.text(g,sale.text,renderer.w/2,104,17,'#b8dff8','center');}
  };
})(window);
