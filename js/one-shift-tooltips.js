(function(root){
  'use strict';
  const O=root.OneShift;
  const controls='button,a[href],summary,input:not([type="hidden"]),select,textarea,[role="button"]';
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const places={
    office:['Office','Go upstairs to purchases, customer orders, equipment and the ledger.'],
    staging:['Receiving','Inspect incoming pallets and put delivered stock away.'],
    storage:['Inventory','Browse your racks and inspect stored stock.'],
    shipping:['Shipping','Stage, wrap and load customer orders.'],
    clock:['Time cards','Return to the clock to save and leave your shift.'],
    floor:['Warehouse floor','Return to the central floor and choose your next stop.'],
    purchases:['Purchase orders','Choose stock, review the cost and place a supplier order.'],
    orders:['Customer orders','Review requests and choose which order to prepare.'],
    equipment:['Equipment catalog','Browse handling equipment and warehouse upgrades.'],
    ledger:['Ledger','Review cash, costs and operating results.']
  };
  const hands={
    handLift:'Lift this pallet onto your jack.',handSetBack:'Return this pallet to the position you lifted it from.',
    handBeginPick:'Take the shipping pallet for this order and collect its cases.',
    handPickCase:'Transfer one case from this stock to your shipping pallet.',
    handStore:'Set your carried pallet into this rack position.',handStage:'Set your picked pallet on the shipping floor.',
    handWrap:'Hold until wrapping finishes. Releasing early cancels the wrap.',handLabel:'Attach the shipping label to this wrapped pallet.',
    handCallTruck:'Call the customer truck to collect the prepared order.',handLoad:'Move your carried pallet into this customer truck.',
    handDispatch:'Release the loaded truck and record payment for the order.',handReleaseSupplier:'Let the empty supplier trailer leave and free its dock.',
    wait:'Advance time until this truck reaches the dock.',scene:'Open the work area for this task.'
  };
  const papers={
    close:'Put this document down and return to the desk.',quantity:'Change the number of cases in your purchase draft.',
    'review-purchase':'Check the total, delivery and storage space before placing this order.',
    'edit-purchase':'Return to the draft to change the product or quantity.',
    'place-purchase':'Pay the quoted total and order this delivery from the supplier.',
    'new-purchase':'Start another supplier purchase order.',receiving:'Go to Receiving to check your delivery.',
    'accept-order':'Reserve the requested stock. You will pick and ship it yourself.',
    'pick-order':'Open Inventory and start collecting this order.', 'ship-order':'Open Shipping to prepare this order for dispatch.',
    'cancel-order':'Cancel this order and release its remaining stock reservations.',
    'buy-equipment':'Purchase and install this warehouse upgrade.'
  };
  const actions={
    'menu-close':'Close the menu and return to your shift.',export:'Download a copy of your warehouse save.',
    import:'Choose a warehouse save file to load.',new:'Start a fresh warehouse with the opening stock and cash.',
    'export-older':'Download the preserved older warehouse save.',
    'business-receiving':'Open the trailer to scan and unload the incoming pallets.',
    'business-fulfill':'Reserve stock for this order and begin picking it yourself.',
    'business-cancel':papers['cancel-order'],'business-need-stock':'Open the purchase pad at your office desk.',
    'business-advance':'Advance the clock to the next customer request.',
    'business-finish':'Advance to the end of the shift after your accepted work is finished.',
    'business-buy':'Purchase this warehouse upgrade.','business-restock':'Place a supplier order for this stock.',
    'business-surplus':'Prepare this stock for sale back to the supplier.'
  };

  class HoverLabels{
    constructor(app){
      this.app=app;this.game=document.getElementById('shift-game');this.nativeTitles=new WeakMap();
      this.keyboard=false;this.target=null;this.dismissed=null;this.timer=0;this.leaveTimer=0;
      this.tip=document.createElement('aside');this.tip.id='shift-hover-label';this.tip.className='shift-tooltip';
      this.tip.setAttribute('role','tooltip');this.tip.setAttribute('popover','manual');this.tip.hidden=true;
      this.tip.innerHTML='<strong class="shift-tooltip-title"></strong><span class="shift-tooltip-detail"></span><span class="shift-tooltip-meta" aria-hidden="true"><span></span><kbd class="shift-tooltip-key"></kbd></span>';
      document.body.append(this.tip);
      document.addEventListener('pointerover',event=>this.pointer(event),true);
      document.addEventListener('pointermove',event=>this.pointer(event),true);
      document.addEventListener('pointerout',event=>{
        if(event.pointerType==='touch'||event.relatedTarget&&this.tip.contains(event.relatedTarget))return;
        if(this.target&&!this.target.contains(event.relatedTarget))this.leave();
      },true);
      document.addEventListener('pointerdown',()=>{this.keyboard=false;this.dismissed=this.target;this.hide();},true);
      document.addEventListener('click',()=>this.hide(),true);
      document.addEventListener('focusin',event=>{
        if(this.keyboard){const node=event.target.closest?.(controls);if(node)this.offer(node,'focus');}
      },true);
      document.addEventListener('focusout',()=>this.hide(),true);
      document.addEventListener('keydown',event=>{
        if(event.key==='Escape'&&!this.tip.hidden){
          // Keep the game's existing Escape action (close paper, menu or pallet).
          this.keyboard=false;this.dismissed=this.target;this.hide();return;
        }
        this.keyboard=true;
        if(['Enter',' '].includes(event.key)){this.keyboard=false;this.dismissed=this.target;this.hide();}
      },true);
      this.tip.addEventListener('pointerenter',()=>clearTimeout(this.leaveTimer));
      this.tip.addEventListener('pointerleave',()=>this.leave());
      const suspend=()=>{this.dismissed=this.target;this.hide();};
      root.addEventListener('blur',suspend);root.addEventListener('resize',suspend);
      root.visualViewport?.addEventListener('resize',suspend);
      document.addEventListener('scroll',suspend,true);
      document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
      this.observer=new MutationObserver(records=>{
        if(!this.target||records.every(r=>this.tip.contains(r.target)))return;
        if(!this.usable(this.target)){this.hide();return;}
        if(!this.tip.hidden)this.render();
      });
      this.observer.observe(this.game,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','inert','open','disabled','aria-disabled','aria-label','title']});
    }
    usable(node){
      return node?.isConnected&&this.game.contains(node)&&!node.closest('[hidden],[inert]')&&node.getClientRects().length>0&&
        !this.app.hidden&&!this.app.rotated&&!document.hidden&&(!this.app.menuPause||!!node.closest('dialog[open]'))&&
        (!this.app.officePause||!!node.closest('#shift-office-papers'));
    }
    resolve(event){
      const node=event.target.closest?.(controls);if(node&&this.game.contains(node))return node;
      // Canvas pallets use their existing alpha hit test, not their bounding boxes.
      const view=event.target===this.app.receiving.canvas?this.app.receiving:event.target===this.app.scenes.canvas?this.app.scenes:null;
      const pallet=view?.hit(event);return pallet?view.nodes.get(pallet.id):null;
    }
    pointer(event){
      if(event.pointerType==='touch'||event.buttons||this.tip.contains(event.target))return;
      const node=this.resolve(event);
      if(node!==this.dismissed)this.dismissed=null;
      if(!node){if(this.mode!=='focus')this.leave();return;}
      if(node===this.dismissed)return;
      this.keyboard=false;this.offer(node,'pointer',{x:event.clientX,y:event.clientY});
    }
    offer(node,mode,point){
      if(!this.usable(node))return;
      clearTimeout(this.leaveTimer);
      this.leaveTimer=0;
      if(this.target===node&&this.mode===mode){if(this.tip.hidden)this.point=point;return;}
      this.hide();this.target=node;this.mode=mode;this.point=point;this.describe(node);
      if(mode==='focus')this.show();else this.timer=setTimeout(()=>this.show(),240);
    }
    leave(){
      if(!this.target||this.leaveTimer)return;
      this.leaveTimer=setTimeout(()=>{this.dismissed=null;this.hide();},140);
    }
    hide(){
      clearTimeout(this.timer);clearTimeout(this.leaveTimer);this.timer=0;this.leaveTimer=0;
      if(this.target){const ids=(this.target.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==this.tip.id);if(ids.length)this.target.setAttribute('aria-describedby',ids.join(' '));else this.target.removeAttribute('aria-describedby');}
      if(this.tip.matches(':popover-open'))this.tip.hidePopover();
      this.tip.hidden=true;this.target=null;this.contentKey=null;
    }
    describe(node){
      const app=this.app,d=node.dataset;
      if(node.hasAttribute('title')){this.nativeTitles.set(node,node.getAttribute('title'));node.removeAttribute('title');}
      const native=this.nativeTitles.get(node);
      let title=clean(node.getAttribute('aria-label')||node.labels?.[0]?.textContent||node.textContent||native),detail='',kind='Control',key='Enter';
      const unavailable=node.disabled||node.getAttribute('aria-disabled')==='true';
      if(d.place&&places[d.place]){[title,detail]=places[d.place];kind=['purchases','orders','equipment','ledger'].includes(d.place)?'Desk document':'Go to';}
      if(d.place==='punch'){
        title=app.places.clockedIn?'Clock out':app.places.saved||app.places.started?'Clock back in':'Clock in';
        detail=app.places.clockedIn?'Save your exact place and leave the shift.':app.places.saved||app.places.started?'Resume your warehouse where you left off.':'Start your shift. Your first delivery is waiting at Receiving.';
        if(!app.places.clockedIn&&(app.places.saved||app.sim.s).phase==='evening'){title='Clock in tomorrow';detail='Begin the next day at your warehouse.';}
        if(app.places.legacySaved){title='Start new warehouse';detail='Keep a backup of the older save and begin a new warehouse.';}
        kind='Time clock';
      }
      if(d.place==='export-older')detail=actions['export-older'];
      if(node.matches('.inventory-aisle')){const parts=title.split(' / ');title=parts.shift();detail=parts.join(' / ')+'. Open this aisle to browse its stock.';kind='Inventory';}
      if(node.matches('.inventory-slot')){const p=app.scenes.inventorySnapshot?.positions.find(p=>p.id===d.slot);if(p){title=p.label;detail=p.reason||(app.sim.s.commerce.hands.carry?'Set your pallet in this empty position.':'Empty position. Bring a pallet here to put stock away.');kind=p.reason?'Unavailable':'Rack position';}}
      if(node.matches('.scene-target,.receiving-target')){
        const view=node.matches('.receiving-target')?app.receiving:app.scenes,p=(view.pallets||view.snapshot?.pallets||[]).find(p=>p.id===Number(d.pallet));
        if(p){title=p.name||O.catalog[p.item]?.name||'Pallet';detail=p.cases+' cases'+(p.lot?' / Lot '+p.lot:'')+'. '+(p.reason||'Inspect this pallet and its available actions.');kind='Pallet '+p.id;}
      }
      if(d.hand){detail=hands[d.hand]||detail;kind=d.hand==='scene'?'Go to':'Handling';if(d.hand==='handWrap')key='Hold';}
      if(d.paperAction){detail=papers[d.paperAction]||detail;kind='Office';}
      if(d.paperAction==='buy-equipment'){const name=clean(node.closest('.office-equipment')?.querySelector('h3')?.textContent);if(name)title=name+' / '+clean(node.textContent);}
      if(d.action){detail=actions[d.action]||detail;if(['save','load'].includes(d.action)){title=(d.action==='save'?'Save to slot ':'Load slot ')+d.id;detail=d.action==='save'?'Save your current warehouse in this slot.':'Restore the warehouse saved in this slot.';}}
      if(d.action==='queue-toggle'){title=node.getAttribute('aria-expanded')==='true'?'Collapse your work':'Expand your work';detail='Show or hide your current orders and next handling steps.';}
      if(d.action==='business-tab')detail=d.id==='stock'?'Review available stock and incoming deliveries.':'Review customer requests and accepted orders.';
      if(d.speed){title=d.speed+'x time';detail=d.speed==='1'?'Run the warehouse clock at normal speed.':'Run the warehouse clock at '+d.speed+' times normal speed.';}
      if(d.setting){const settings={volume:['Volume','Adjust warehouse ambience and handling sounds.'],scale:['Interface size','Adjust text and control size.'],reducedMotion:['Reduced motion','Reduce interface animation.'],colorblind:['Color marks','Use additional marks to distinguish information.']};[title,detail]=settings[d.setting]||[title,detail];key=node.type==='range'?'Arrows':'Space';}
      if(node.matches('summary')){title=(node.parentElement.open?'Close ':'Open ')+title;detail='Show or hide these menu options.';}
      if(node.id==='office-purchase-product'){title='Product';detail='Choose the stock for this purchase order.';key='Arrows';}
      if(['place-menu','shift-menu'].includes(node.id)){title='Game menu';detail='Sound, interface size, accessibility and saved games.';key=app.ui.settings.keys.menu;}
      if(node.id==='place-sound'){title=app.places.soundOn()?'Mute sound':'Enable sound';detail='Toggle warehouse ambience and handling sounds.';}
      if(['shift-pause','receiving-pause'].includes(node.id)){title=app.paused?'Resume shift':'Pause shift';detail=app.paused?'Continue the warehouse clock and handling.':'Hold the warehouse clock while you look around.';key=app.ui.settings.keys.pause;}
      if(node.id==='place-back')detail=places.floor[1];
      if(['scene-prev','scene-next'].includes(node.id))detail=node.disabled?'There are no more areas in this direction.':'Browse the '+(node.id==='scene-prev'?'previous':'next')+' area.';
      if(d.inventoryBack!==undefined)detail='Return to the overview and choose an aisle.';
      if(['scene-deselect','receiving-deselect'].includes(node.id))detail='Close these pallet details and return to the scene.';
      if(['receiving-close','receiving-finish'].includes(node.id))detail='Return to the receiving floor to put stock away.';
      if(node.id==='receiving-scan'){
        const p=app.receiving.pallets?.find(p=>p.id===app.receiving.selected);title=p?.canUnload?'Unload to Receiving':'Scan pallet';
        detail=p?.canUnload?'Pull this checked pallet onto the receiving floor.':'Read this pallet label and check its product, case count and lot.';
        if(unavailable)detail=app.paused?'Resume the shift to handle this pallet.':p?.reason||'Wait for the current handling step to finish.';
      }
      if(unavailable){
        kind='Unavailable';key='';
        const reason=node.closest('.office-order,.office-equipment,.office-purchase-draft,.office-purchase-review')?.querySelector('.office-paper-reason,small');
        detail=clean(reason?.textContent)||native||detail;
        if(d.hand)detail=app.paused?'Resume the shift to continue handling.':d.hand==='handLift'?'Set down the pallet already on your jack first.':detail;
        if(d.action==='load')detail='This save slot is empty.';
        if(d.paperAction==='cancel-order'||d.action==='business-cancel')detail='This order is already loaded. Finish its dispatch.';
      }
      if(node.matches('a[href]')){kind='Navigation';detail=detail||'Return to the portfolio and leave the game.';}
      if(!detail&&native&&native!==title)detail=native;
      return {title,detail,kind,key:clean(key===' '?'Space':key)};
    }
    show(){
      this.timer=0;if(!this.usable(this.target)){this.hide();return;}
      const parent=this.target.closest('dialog,[role="dialog"]')||document.body;
      if(this.tip.parentElement!==parent)parent.append(this.tip);
      this.tip.hidden=false;this.render();
      if(this.tip.showPopover&&!this.tip.matches(':popover-open'))this.tip.showPopover();
      this.position();
      const ids=new Set((this.target.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(this.tip.id);this.target.setAttribute('aria-describedby',[...ids].join(' '));
    }
    render(){
      const data=this.describe(this.target),signature=JSON.stringify(data);if(signature===this.contentKey)return;
      this.contentKey=signature;this.tip.querySelector('.shift-tooltip-title').textContent=data.title;
      const detail=this.tip.querySelector('.shift-tooltip-detail');detail.textContent=data.detail;detail.hidden=!data.detail;
      this.tip.querySelector('.shift-tooltip-meta>span').textContent=data.kind;
      const key=this.tip.querySelector('kbd');key.textContent=data.key;key.hidden=!data.key||this.mode!=='focus';
      this.tip.dataset.reducedMotion=String(!!this.app.ui.settings.reducedMotion);
      this.position();
    }
    position(){
      if(this.tip.hidden||!this.target)return;
      const viewport=root.visualViewport,edge=12,left=(viewport?.offsetLeft||0)+edge,top=(viewport?.offsetTop||0)+edge;
      const right=left+(viewport?.width||innerWidth)-2*edge,bottom=top+(viewport?.height||innerHeight)-2*edge;
      const box=this.target.getBoundingClientRect(),tip=this.tip.getBoundingClientRect();
      let x=this.mode==='pointer'?this.point.x+18:box.left+box.width/2-tip.width/2;
      let y=this.mode==='pointer'?this.point.y+22:box.bottom+10;
      if(x+tip.width>right)x=this.mode==='pointer'?this.point.x-tip.width-18:right-tip.width;
      if(y+tip.height>bottom)y=(this.mode==='pointer'?this.point.y:box.top)-tip.height-12;
      this.tip.style.left=Math.round(Math.max(left,Math.min(x,right-tip.width)))+'px';
      this.tip.style.top=Math.round(Math.max(top,Math.min(y,bottom-tip.height)))+'px';
    }
  }
  O.HoverLabels=HoverLabels;
  O.app.hoverLabels=new HoverLabels(O.app);
})(window);
