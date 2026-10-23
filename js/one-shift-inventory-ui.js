(function(root){
  'use strict';
  const O=root.OneShift,Base=O.WarehouseScenes;
  const PAPER='#f0e1c6',INK='#252620',RUST='#a44a2d';
  const CARGO=['pallet-cargo.png','pallet-mixed.png','pallet-low.png','pallet-tall.png'];
  const aisleName=index=>'Aisle '+String.fromCharCode(65+index);
  O.WarehouseScenes=class extends Base{
    constructor(app){
      super(app);
      this.inventoryEnabled=true;this.inventoryMode='overview';this.inventoryAisle=0;this.inventoryBay=0;this.inventoryLevel=0;
      this.inventorySurface=document.createElement('div');this.inventorySurface.className='inventory-surface';
      this.inventorySurface.innerHTML='<img class="inventory-overview-image" alt="Four warehouse rack aisles" draggable="false"><div class="inventory-targets"></div>';
      this.stage.append(this.inventorySurface);
      this.inventoryImage=this.inventorySurface.querySelector('img');
      this.inventoryTargets=this.inventorySurface.querySelector('.inventory-targets');
      this.inventoryArt=new O.PlaceArt({container:this.inventorySurface,image:this.inventoryImage,targets:this.inventoryTargets,onChoose:id=>this.chooseInventory(id),onHover:(id,label)=>{this.inventoryHover=label;this.inventoryNote();}});
      this.inventoryLoading=document.createElement('div');this.inventoryLoading.className='inventory-loading';
      this.inventoryLoading.innerHTML='<p>Opening the rack aisles...</p><button type="button" hidden>Try again</button>';this.stage.append(this.inventoryLoading);
      this.inventoryLoading.querySelector('button').addEventListener('click',()=>this.loadInventory());
      this.inventoryFooter=document.createElement('p');this.inventoryFooter.className='inventory-note';this.inventoryFooter.setAttribute('role','status');
      this.element.querySelector('.scene-nav').before(this.inventoryFooter);
      this.inventoryLevels=document.createElement('nav');this.inventoryLevels.className='inventory-levels';this.inventoryLevels.setAttribute('aria-label','Rack levels');
      this.inventoryLevels.innerHTML='<button type="button" data-inventory-up aria-label="Look up one level"><span class="inventory-arrow up" aria-hidden="true"></span><span>Up</span></button><output aria-live="polite"></output><button type="button" data-inventory-down aria-label="Look down one level"><span>Down</span><span class="inventory-arrow down" aria-hidden="true"></span></button>';
      this.stage.append(this.inventoryLevels);
      this.inventoryLevels.querySelector('[data-inventory-up]').addEventListener('click',()=>this.setInventoryLevel(this.inventoryLevel+1));
      this.inventoryLevels.querySelector('[data-inventory-down]').addEventListener('click',()=>this.setInventoryLevel(this.inventoryLevel-1));
      this.inventoryRoute=document.createElement('nav');this.inventoryRoute.className='inventory-route';this.inventoryRoute.setAttribute('aria-label','Walk to a rack');
      this.inventoryFooter.before(this.inventoryRoute);
      this.inventoryRoute.addEventListener('click',event=>{const button=event.target.closest('[data-inventory-rack]');if(button)this.openInventoryAisle(Number(button.dataset.aisle),Number(button.dataset.bay));});
      // Empty openings use the same small-touch allowance as room objects.
      // Pallets keep their existing alpha hit testing on the canvas beneath.
      this.canvas.addEventListener('pointerdown',event=>{if(this.scene==='storage'&&this.inventoryMode==='bay'&&!this.blocked()&&!this.hit({clientX:event.clientX,clientY:event.clientY,pointerType:'mouse'}))this.inventoryArt.pointerDown(event);});
      this.inventoryReady=this.loadInventory();this.sync(true);
    }
    async loadInventory(){
      this.inventoryLoaded=false;this.inventoryError=false;
      this.inventoryLoading.querySelector('p').textContent='Opening the rack aisles...';this.inventoryLoading.querySelector('button').hidden=true;
      try{
        const rack=new Image();rack.src='assets/one-shift/inventory-v1/rack.webp';this.inventoryImage.src='assets/one-shift/inventory-v1/aisles.webp';
        await Promise.all([rack.decode(),this.inventoryImage.decode()]);this.inventoryRack=rack;this.inventoryLoaded=true;
      }catch(error){this.inventoryError=true;this.inventoryLoading.querySelector('p').textContent='The inventory artwork could not load.';this.inventoryLoading.querySelector('button').hidden=false;}
      this.sync(true);this.resize();
    }
    open(scene){
      if(this.inventoryEnabled){this.inventoryArt.suspend();if(scene==='storage'){this.inventoryMode='overview';this.inventoryLevel=0;this.inventoryCameraY=null;this.inventorySelectedSlot=null;this.inventoryTargetKey=null;}else this.inventoryHover='';}
      super.open(scene);
      if(this.inventoryEnabled){this.setInventoryVisibility();if(scene==='storage')this.sync(true);}
    }
    setInventoryVisibility(){
      const active=this.scene==='storage';this.element.classList.toggle('inventory-view',active);this.element.dataset.inventoryMode=active?this.inventoryMode:'';
      this.inventorySurface.hidden=!active;this.inventoryFooter.hidden=!active;this.inventoryLoading.hidden=!active||this.inventoryLoaded;
      this.element.querySelector('.scene-pages').hidden=active;
      this.inventoryLevels.hidden=!active||this.inventoryMode!=='bay';this.inventoryRoute.hidden=!active||this.inventoryMode!=='bay';
      const nav=this.element.querySelector('.scene-nav');let back=nav.querySelector('[data-inventory-back]');
      if(!back){back=document.createElement('button');back.type='button';back.dataset.inventoryBack='';back.textContent='All four aisles';back.addEventListener('click',()=>this.openInventoryOverview());nav.prepend(back);}
      back.hidden=!active||this.inventoryMode==='overview';
      nav.classList.toggle('inventory-bay-nav',active&&this.inventoryMode==='bay');
      this.inventoryImage.hidden=this.inventoryMode==='bay';
    }
    openInventoryOverview(){
      if(this.blocked())return;this.inventoryMode='overview';this.selected=null;this.hover=null;this.inventorySelectedSlot=null;this.inventoryTargetKey=null;this.inventoryArt.suspend();this.sync(true);this.resize();
      this.inventoryTargets.querySelector('[data-aisle="'+this.inventoryAisle+'"]')?.focus({preventScroll:true});
    }
    openInventoryAisle(index,bay=0){
      if(this.blocked()||!Number.isInteger(index)||index<0||index>3)return;
      this.inventoryMode='bay';this.inventoryAisle=index;this.inventoryBay=bay;this.selected=null;this.hover=null;this.inventorySelectedSlot=null;this.inventoryTargetKey=null;this.inventoryArt.suspend();
      this.app.audio.play('click');this.sync(true);this.resize();this.element.focus({preventScroll:true});this.announce(this.snapshot.title+'. Level '+(this.inventoryLevel+1)+' of 4.');
    }
    setInventoryLevel(level){
      if(this.blocked()||this.inventoryMode!=='bay'||!Number.isInteger(level)||level<0||level>3||level===this.inventoryLevel)return;
      this.inventoryLevel=level;this.selected=null;this.hover=null;this.inventorySelectedSlot=null;this.inventoryTargetKey=null;this.inventoryArt.suspend();
      this.app.audio.play('click');this.sync(true);this.resize();this.announce('Level '+(level+1)+' of 4. '+this.snapshot.title+'.');
    }
    inventoryCenter(){
      const slot=O.inventoryArtLayout.rack.slots.find(s=>s.level===this.inventoryLevel&&s.side===0);
      return slot.y+slot.h/2+14;
    }
    updateInventoryNavigation(){
      const view=this.inventorySnapshot;
      this.inventoryLevels.querySelector('output').innerHTML='<span>LEVEL</span><b>'+(this.inventoryLevel+1)+' / 4</b>';
      this.inventoryLevels.querySelector('[data-inventory-up]').disabled=this.inventoryLevel===3;
      this.inventoryLevels.querySelector('[data-inventory-down]').disabled=this.inventoryLevel===0;
      const racks=view.aisles.flatMap(a=>a.bays.map(b=>({...b,aisleIndex:a.index}))).sort((a,b)=>a.ordinal-b.ordinal);
      this.inventoryRacks=racks;
      const key=JSON.stringify(racks.map(b=>[b.rack,b.ordinal,b.rack===view.rack]));
      if(key===this.inventoryRouteKey)return;this.inventoryRouteKey=key;
      this.inventoryRoute.innerHTML=racks.map(b=>'<button type="button" data-inventory-rack="'+b.rack+'" data-aisle="'+b.aisleIndex+'" data-bay="'+b.index+'" aria-current="'+(b.rack===view.rack?'location':'false')+'" aria-label="'+(b.rack===view.rack?'At':'Walk to')+' Rack '+(b.ordinal+1)+', Aisle '+b.aisle+', Bay '+b.number+'"><strong>Rack '+(b.ordinal+1)+'</strong><span>'+b.aisle+String(b.number).padStart(2,'0')+'</span></button>').join('');
      const current=this.inventoryRoute.querySelector('[aria-current="location"]');
      if(current)this.inventoryRoute.scrollLeft=current.offsetLeft-this.inventoryRoute.clientWidth/2+current.offsetWidth/2;
    }
    chooseInventory(id){
      if(this.blocked()||!this.inventoryLoaded)return;
      this.app.audio.unlock();
      if(id.startsWith('aisle-')){this.openInventoryAisle(Number(id.slice(6)));return;}
      const slot=this.inventorySnapshot?.positions.find(p=>p.id===id&&p.level===this.inventoryLevel);if(!slot)return;
      const carry=this.app.sim.p.get(this.app.sim.s.commerce.hands.carry);
      if(carry&&!carry.businessOrder&&slot.available){
        if(this.app.paused)return;
        const result=this.app.sim.command({type:'handStore',slot:id});
        if(!result.ok)this.app.ui.toast(result.reason,true);else{this.app.audio.play('click');this.inventorySelectedSlot=null;this.announce('Stored in '+slot.label+'.');}
        this.app.ui.update();this.sync(true);this.app.receiving.sync();
      }else{
        this.inventorySelectedSlot=id;this.inventoryHover='';this.inventoryNote();this.announce(this.inventoryFooter.textContent);
      }
    }
    changePage(direction){
      if(!this.inventoryEnabled||this.scene!=='storage')return super.changePage(direction);
      if(this.blocked()||this.inventoryMode!=='bay')return;
      const bays=this.inventorySnapshot?.bays||[],index=bays.findIndex(b=>b.index===this.inventoryBay),next=bays[index+direction];
      if(next)this.openInventoryAisle(this.inventoryAisle,next.index);
    }
    inventoryInstruction(view){
      const sim=this.app.sim,carry=sim.p.get(sim.s.commerce.hands.carry),order=sim.handOrder();
      const source=carry?.businessOrder&&order?.allocations.find(a=>!a.collected&&a.output===carry.id);
      const location=source&&O.inventoryLocation(sim,source.source);
      if(location)return 'Pick '+source.count+' cases in Aisle '+location.aisle+', Bay '+location.bayNumber+', level '+(location.level+1)+'.';
      if(carry&&!carry.businessOrder)return 'Choose an aisle, then an available position for your pallet.';
      if(order&&!carry)return 'Take an empty pallet to start the pick. Choose its source aisle.';
      return view.totalPallets+' stored '+(view.totalPallets===1?'pallet':'pallets')+' / '+view.totalCases+' cases. '+(this.inventoryMode==='overview'?'Choose one of the four aisles.':'Select stock or inspect an empty position.');
    }
    inventoryNote(){
      if(!this.inventoryFooter||!this.inventorySnapshot)return;
      const slot=this.inventorySnapshot.positions.find(p=>p.id===this.inventorySelectedSlot);
      this.element.classList.toggle('inventory-slot-inspected',!!slot);
      this.inventoryFooter.textContent=this.inventoryHover||(slot?slot.label+'. '+(slot.reason||'Empty and available for putaway.'):(this.inventoryMode==='overview'?'Aisles A, B, C and D, from left to right.':this.inventorySnapshot.rack?'Look up or down to inspect each level. Choose a numbered rack to walk there.':'No rack bays in this aisle. Add a rack from the office equipment catalog.'));
    }
    sync(force=false){
      if(!this.inventoryEnabled||this.scene!=='storage')return super.sync(force);
      const now=performance.now();if(!force&&now-this.lastSync<100)return;this.lastSync=now;
      O.ensureInventoryLayout(this.app.sim);
      const view=O.inventorySnapshot(this.app.sim,this.inventoryMode==='bay'?this.inventoryAisle:null,this.inventoryBay);if(!view)return;
      this.inventorySnapshot=view;if(this.inventoryMode==='bay')this.inventoryBay=view.bay;
      const stock=this.inventoryMode==='bay'?view.pallets.filter(p=>p.level===this.inventoryLevel).map(p=>({...p,selectable:true,status:p.claimed?p.claimed+' cases on your pick list':'Available stock'})):[];
      this.snapshot={scene:'storage',title:this.inventoryMode==='overview'?'Inventory / four aisles':view.title,pallets:stock,page:this.inventoryBay,pages:view.bays.length,total:view.totalPallets,capacity:view.usable,work:[this.inventoryInstruction(view)]};
      this.page=this.inventoryBay;
      if(!stock.some(p=>p.id===this.selected))this.selected=null;
      if(!stock.some(p=>p.id===this.hover))this.hover=null;
      const rack=view.bays.find(b=>b.rack===view.rack);
      this.el('title').textContent=this.inventoryMode==='bay'&&rack?'Rack '+(rack.ordinal+1)+' / '+view.aisle+String(view.bayNumber).padStart(2,'0'):this.snapshot.title;this.el('work').textContent=this.snapshot.work[0];this.el('work').title=this.snapshot.work[0];
      this.el('page').textContent='Bay '+(view.bayNumber||'-')+' / '+view.bays.length;
      const bayIndex=view.bays.findIndex(b=>b.index===view.bay);this.el('prev').disabled=bayIndex<=0;this.el('next').disabled=bayIndex<0||bayIndex>=view.bays.length-1;
      this.el('empty').hidden=true;this.setInventoryVisibility();this.updateInventoryNavigation();this.updateTargets();this.updatePanel();this.updateHands();this.updateInventoryTargets();this.inventoryNote();this.dirty=true;this.paint();
    }
    resize(){
      if(!this.inventoryEnabled||this.scene!=='storage')return super.resize();
      const r=this.stage.getBoundingClientRect();if(!r.width||!r.height)return;
      this.w=r.width;this.h=r.height;this.dpr=Math.min(2,root.devicePixelRatio||1);this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);
      if(this.inventoryMode==='bay'){
        // Keep the foreground rack large; the right-hand gap reveals the rows beyond it.
        this.scale=Math.min((this.w-58)/1250,this.h/250);
        this.ox=58-395*this.scale;
        if(this.inventoryCameraY==null||!this.app.raf||matchMedia('(prefers-reduced-motion: reduce)').matches)this.inventoryCameraY=this.inventoryCenter();
        this.oy=Math.max(Math.min(0,this.h-1024*this.scale),Math.min(0,this.h/2-this.inventoryCameraY*this.scale));
      }else{this.scale=Math.min(this.w/1536,this.h/1024);this.ox=(this.w-1536*this.scale)/2;this.oy=(this.h-1024*this.scale)/2;}
      Object.assign(this.inventorySurface.style,{left:this.ox+'px',top:this.oy+'px',width:1536*this.scale+'px',height:1024*this.scale+'px'});
      this.inventoryArt.resize();this.updateTargets();this.updateHands();this.dirty=true;this.paint();
    }
    geometry(p,index){
      if(!this.inventoryEnabled||this.scene!=='storage')return super.geometry(p,index);
      const slot=O.inventoryArtLayout.rack.slots.find(s=>s.level===p.level&&s.side===p.side),asset=this.images.get(CARGO[O.palletArtIndex(p)]);if(!slot||!asset?.bounds)return null;
      const b=asset.bounds,scale=Math.min((slot.w-24)/b.w,(slot.h-12)/b.h),w=b.w*scale,h=b.h*scale;
      return {p,asset,x:slot.base[0]-w/2,y:slot.base[1]-h,w,h};
    }
    updateTargets(){
      super.updateTargets();
      if(!this.inventoryEnabled||this.scene!=='storage')return;
      for(const [id,node]of this.nodes){const p=this.inventorySnapshot?.positions.find(p=>p.pallet===id);if(!p)continue;node.classList.add('inventory-position');Object.assign(node.dataset,{slot:p.id,aisle:String(p.aisleIndex),bay:String(p.bay),level:String(p.level),side:String(p.side)});}
    }
    updateHands(){
      super.updateHands();
      if(this.inventoryEnabled&&this.scene==='storage'){this.handLayer.replaceChildren();this.handLayer._handsHTML='';}
    }
    updatePanel(){
      super.updatePanel();
      if(this.inventoryEnabled&&this.scene==='storage'&&this.selected!==null){const p=this.snapshot?.pallets.find(p=>p.id===this.selected);if(p)this.el('place').textContent='Aisle '+p.aisle+' / Bay '+p.bayNumber+' / level '+(p.level+1)+' / '+(p.side?'right':'left');}
    }
    updateInventoryTargets(){
      if(!this.inventorySnapshot)return;
      const view=this.inventorySnapshot,carry=this.app.sim.p.get(this.app.sim.s.commerce.hands.carry);
      const key=JSON.stringify([this.inventoryMode,this.inventoryAisle,this.inventoryBay,this.inventoryLevel,view.aisles.map(a=>[a.bayCount,a.pallets,a.cases]),view.positions.map(p=>[p.id,p.pallet,p.locked,p.available,p.reason]),!!carry&&!carry.businessOrder]);
      if(key===this.inventoryTargetKey)return;this.inventoryTargetKey=key;
      const targets=this.inventoryMode==='overview'?O.inventoryArtLayout.overview.targets.map((target,index)=>({...target,label:aisleName(index)+' / '+view.aisles[index].bayCount+' '+(view.aisles[index].bayCount===1?'bay':'bays')+' / '+view.aisles[index].pallets+' pallets / '+view.aisles[index].cases+' cases'})):
        view.positions.filter(p=>!p.pallet&&p.level===this.inventoryLevel).map(position=>{const s=O.inventoryArtLayout.rack.slots.find(s=>s.level===position.level&&s.side===position.side);return {id:position.id,label:position.label+'. '+(position.reason||(carry&&!carry.businessOrder&&position.available?'Set your pallet here.':'Empty position.')),path:s.path||'M'+s.x+','+s.y+'h'+s.w+'v'+s.h+'h-'+s.w+'Z',bounds:[s.x,s.y,s.w,s.h],point:[s.x+s.w/2,s.y+s.h/2]};});
      this.inventoryArt.setScene({width:1536,height:1024,targets});
      for(const node of this.inventoryTargets.querySelectorAll('.place-target')){
        if(this.inventoryMode==='overview'){node.classList.add('inventory-aisle');node.dataset.aisle=node.dataset.place.slice(6);}
        else{const p=view.positions.find(p=>p.id===node.dataset.place);node.classList.add('inventory-slot','inventory-position');Object.assign(node.dataset,{slot:p.id,aisle:String(p.aisleIndex),bay:String(p.bay),level:String(p.level),side:String(p.side),locked:String(p.locked),available:String(p.available)});}
      }
    }
    paint(){
      if(!this.inventoryEnabled||this.scene!=='storage')return super.paint();
      if(!this.dirty||!this.scale||this.app.receiving?.visible)return;this.dirty=false;
      const g=this.ctx;g.setTransform(this.dpr,0,0,this.dpr,0,0);g.fillStyle=PAPER;g.fillRect(0,0,this.w,this.h);
      if(this.inventoryMode==='overview')return;
      g.translate(this.ox,this.oy);g.scale(this.scale,this.scale);
      if(this.inventoryRack&&this.inventorySnapshot.rack){
        g.drawImage(this.inventoryRack,0,0,1536,1024);
        for(let x=1536;x<1800;x+=80)g.drawImage(this.inventoryRack,1170,0,80,1024,x,0,80,1024);
        // Reuse the authored empty steel structure. Every background load is
        // projected from that rack's real stock, never decorative duplicate cargo.
        const current=this.inventoryRacks.findIndex(b=>b.rack===this.inventorySnapshot.rack);
        this.inventoryDepth=this.inventoryRacks.slice(current+1,current+4);
        for(let i=this.inventoryDepth.length-1;i>=0;i--){
          const rack=this.inventoryDepth[i],scale=[.6,.39,.25][i],x=[1095,1320,1465][i],y=600*(1-scale);
          g.save();g.translate(x-398*scale,y);g.scale(scale,scale);g.globalAlpha=1-i*.16;
          g.drawImage(this.inventoryRack,398,0,740,920,398,0,740,920);
          for(const position of rack.positions){if(position.stock){const q=this.geometry(position.stock);if(q)this.drawInventoryPallet(g,q);}}
          g.restore();
        }
        if(current>=0)g.drawImage(this.inventoryRack,398,0,740,920,398,0,740,920);
        for(let i=0;i<this.inventoryDepth.length;i++){
          const rack=this.inventoryDepth[i],scale=[.6,.39,.25][i],x=[1095,1320,1465][i]+660*scale,y=600*(1-scale)+O.inventoryArtLayout.rack.slots.find(s=>s.level===this.inventoryLevel).base[1]*scale;
          const w=34/this.scale,h=23/this.scale;
          g.fillStyle=INK;g.fillRect(x-w/2,y+8,w,h);g.fillStyle=PAPER;g.textAlign='center';g.font=(12/this.scale)+'px "Commit Mono",monospace';g.fillText('R'+(rack.ordinal+1),x,y+8+h*.72);
        }
      }else this.inventoryDepth=[];
      for(const p of this.inventorySnapshot.pallets){const q=this.geometry(p);if(q)this.drawInventoryPallet(g,q);}
      if(this.inventorySnapshot?.rack)for(const slot of this.inventorySnapshot.positions){const s=O.inventoryArtLayout.rack.slots.find(s=>s.level===slot.level&&s.side===slot.side),text=this.inventorySnapshot.aisle+String(this.inventoryBay+1).padStart(2,'0')+'-'+(slot.level+1)+(slot.side?'R':'L');
        g.fillStyle=slot.locked?RUST:PAPER;g.fillRect(s.base[0]-47,s.base[1]+5,94,21);g.fillStyle=slot.locked?PAPER:INK;g.font='14px "Commit Mono",monospace';g.textAlign='center';g.fillText(text,s.base[0],s.base[1]+20);
      }
    }
    advance(dt){
      if(this.inventoryEnabled&&this.scene==='storage'&&this.inventoryMode==='bay'&&!this.blocked()){
        const target=this.inventoryCenter(),distance=target-this.inventoryCameraY;
        if(Math.abs(distance)>.2){this.inventoryCameraY+=distance*Math.min(1,dt*14);this.resize();}
        else if(distance){this.inventoryCameraY=target;this.resize();}
      }
      super.advance(dt);
    }
    drawInventoryPallet(g,q){
      const {p,asset,x,y,w,h}=q,b=asset.bounds,draw=()=>g.drawImage(asset.image,b.x,b.y,b.w,b.h,x,y,w,h);g.save();
      if(p.id===this.selected||p.id===this.hover){for(const [color,offset]of [[PAPER,4],[RUST,1.5]]){g.shadowColor=color;g.shadowBlur=0;for(const [dx,dy]of [[-offset,0],[offset,0],[0,-offset],[0,offset]]){g.shadowOffsetX=dx*this.scale*this.dpr;g.shadowOffsetY=dy*this.scale*this.dpr;draw();}}g.shadowColor='transparent';g.shadowOffsetX=0;g.shadowOffsetY=0;}
      draw();g.restore();
    }
    key(event){
      if(this.inventoryEnabled&&this.scene==='storage'&&this.inventoryMode==='bay'&&!this.blocked()&&['ArrowUp','ArrowDown'].includes(event.key)&&!event.target.closest('.scene-label')){event.preventDefault();event.stopPropagation();this.setInventoryLevel(this.inventoryLevel+(event.key==='ArrowUp'?1:-1));return;}
      if(this.inventoryEnabled&&this.scene==='storage'&&event.key==='Escape'&&this.selected===null&&this.inventoryMode==='bay'&&!this.blocked()){event.preventDefault();event.stopPropagation();this.openInventoryOverview();return;}
      super.key(event);
    }
    suspend(){this.inventoryArt?.suspend();super.suspend();}
  };
})(window);
