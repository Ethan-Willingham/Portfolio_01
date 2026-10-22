(function (root) {
  'use strict';
  const O = root.OneShift;
  const ART = 'assets/one-shift/receiving/';
  const INK = '#252620', PAPER = '#f0e1c6', RUST = '#ad5431';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = value => String(value).padStart(2, '0');
  const variants = ['pallet-cargo.png', 'pallet-mixed.png', 'pallet-low.png', 'pallet-tall.png'];
  const hash = value => Array.from(String(value)).reduce((n,c) => (Math.imul(n,31)+c.charCodeAt(0))>>>0,17);

  class ReceivingView {
    constructor(app) {
      this.app = app;
      this.visible = false;
      this.images = new Map();
      this.selected = null;
      this.hover = null;
      this.layout = [];
      this.nodes = new Map();
      this.assetFailed = false;
      this.element = document.createElement('section');
      this.element.id = 'shift-receiving';
      this.element.tabIndex = -1;
      this.element.hidden = true;
      this.element.setAttribute('aria-label', 'Receiving dock');
      this.element.innerHTML = `
        <header class="receiving-header">
          <div class="receiving-wordmark">One Shift<span>THE RECEIVING DOCK</span></div>
          <div class="receiving-location"><span id="receiving-door">DOCK 01</span><strong id="receiving-trailer">Inbound freight</strong></div>
          <nav aria-label="Receiving controls"><button id="receiving-pause" aria-pressed="false">Pause</button><button id="receiving-close">Receiving floor</button></nav>
        </header>
        <div class="receiving-stage">
          <canvas id="receiving-canvas" aria-hidden="true"></canvas>
          <div id="receiving-targets" aria-label="Pallets in trailer"></div>
          <div class="receiving-caption"><span id="receiving-shipment">INBOUND / 001</span><p id="receiving-cargo">Your first delivery.</p></div>
          <div id="receiving-loading" role="status"><span>Opening the trailer...</span></div>
          <aside id="receiving-label" class="receiving-label" aria-labelledby="receiving-product" hidden>
            <div class="receiving-label-head"><span id="receiving-pallet-number">PALLET 01</span><button id="receiving-deselect" aria-label="Deselect pallet">Close</button></div>
            <h2 id="receiving-product"></h2>
            <dl><div><dt>CASES</dt><dd id="receiving-cases"></dd></div><div><dt>LOT</dt><dd id="receiving-lot"></dd></div></dl>
            <canvas id="receiving-barcode" aria-label="Pallet barcode"></canvas>
            <p id="receiving-scan-note">Ready to receive.</p>
            <button id="receiving-scan"><span>Scan pallet</span><kbd>ENTER</kbd></button>
          </aside>
          <aside id="receiving-complete" class="receiving-complete" hidden><p class="receiving-eyebrow">READY TO UNLOAD</p><h2>Labels checked.</h2><p id="receiving-complete-copy"></p><button id="receiving-finish">Back to the floor</button></aside>
        </div>
        <footer class="receiving-footer"><div><strong id="receiving-instruction">Select a pallet.</strong><span id="receiving-help">Work from the dock toward the back.</span></div><div class="receiving-count"><div id="receiving-tally" aria-hidden="true"></div><output id="receiving-count">0 / 6 scanned</output></div></footer>
        <p id="receiving-live" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>`;
      document.getElementById('shift-game').append(this.element);
      this.canvas = this.el('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.stage = this.element.querySelector('.receiving-stage');
      this.launch = document.getElementById('shift-receiving-open');
      this.launch.addEventListener('click', () => this.open());
      this.el('close').addEventListener('click', () => this.close());
      this.el('finish').addEventListener('click', () => this.close());
      this.el('deselect').addEventListener('click', () => this.select(null));
      this.el('scan').addEventListener('click', () => this.scan());
      this.el('pause').addEventListener('click', () => { app.paused = !app.paused; if (app.paused) app.audio.suspend(); else app.audio.unlock(); this.updatePanel(); });
      this.canvas.addEventListener('pointermove', e => { if (e.pointerType === 'touch' || this.scanning || app.rotated) return; const p = this.hit(e); const id = p?.id ?? null; if (id !== this.hover) { this.hover = id; this.canvas.style.cursor = p?.canScan ? 'pointer' : p ? 'not-allowed' : 'default'; this.draw(); } });
      this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
      this.canvas.addEventListener('pointerup', e => { if (app.rotated || this.scanning || e.button > 0) return; this.select(this.hit(e)?.id ?? null); });
      this.element.addEventListener('keydown', e => this.key(e));
      this.element.addEventListener('click', e => e.stopPropagation());
      this.resizeObserver = new ResizeObserver(() => { if (this.visible) this.resize(); });
      this.resizeObserver.observe(this.stage);
      this.ready = Promise.all(['trailer-empty.png','trailer-dock-two.png',...variants].map(name => this.loadImage(name))).then(() => {
        this.el('loading').hidden = true; this.updateTargets(); this.draw();
      }).catch(() => {
        this.assetFailed = true;
        this.el('loading').innerHTML = '<span>The dock artwork could not load.</span><button id="receiving-retry">Try again</button>';
        document.getElementById('receiving-retry').addEventListener('click', () => location.reload());
      });
      this.attach(true);
    }
    el(id) { return document.getElementById('receiving-'+id); }
    async loadImage(name) {
      const image = new Image(); image.src = ART+name.replace('.png','.webp')+'?v=1'; await image.decode();
      const asset = {image};
      if (name.startsWith('pallet-')) {
        // Keep the generated master intact. Alpha is read only for exact silhouette hit testing.
        const mask = document.createElement('canvas'); mask.width=image.width; mask.height=image.height;
        const ctx=mask.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
        const pixels=ctx.getImageData(0,0,image.width,image.height).data;
        let x0=image.width,y0=image.height,x1=0,y1=0;
        for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixels[(y*image.width+x)*4+3]>96){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
        asset.bounds={x:x0,y:y0,w:x1-x0+1,h:y1-y0+1}; asset.alpha=pixels;
      }
      this.images.set(name,asset);
    }
    attach(prepare=false) {
      if (this.visible) this.close(false);
      this.state=this.app.sim.s;this.selected=null;this.hover=null;this.scanning=null;this.departing=null;
      if (!O.business(this.state)) { this.launch.hidden=true;return; }
      this.app.sim.setManualReceiving(true);
      const prepared=prepare&&this.app.sim.prepareReceivingOpening();
      this.sync();
      if (prepared?.ok || prepared===true) this.open();
    }
    sync() {
      if (this.state!==this.app.sim.s) { this.attach(false); return; }
      if (!O.business(this.state)) return;
      this.loads=this.app.sim.receivingLoads();
      const available=this.loads.filter(t=>t.status==='docked'&&t.remaining>0);
      this.launch.hidden=!available.length;
      this.launch.textContent=available.length?'Receive stock / '+available.reduce((n,t)=>n+t.remaining,0):'Receive stock';
      if (!this.visible) return;
      const load=this.loads.find(t=>t.id===this.truckId);
      if (!load) { this.close();return; }
      this.load=load;
      const key=JSON.stringify([load.id,load.remaining,load.pallets.map(p=>[p.id,p.scanned,p.canScan,p.reason]),this.app.paused]);
      if(this.stateKey===key)return;this.stateKey=key;
      this.pallets=load.pallets;
      if(this.selected&&!this.pallets.some(p=>p.id===this.selected&&!p.scanned))this.selected=null;
      this.updateTargets();this.updatePanel();this.draw();
    }
    open(truckId) {
      if(!O.business(this.app.sim.s))return;
      const loads=this.app.sim.receivingLoads();
      const load=truckId?loads.find(t=>t.id===truckId&&t.status==='docked'):loads.find(t=>t.status==='docked'&&t.remaining);
      if(!load)return;
      this.returnFocus=document.activeElement;
      this.truckId=load.id;this.load=load;this.pallets=load.pallets;this.selected=null;this.hover=null;this.notice='';this.stateKey=null;
      this.visible=true;this.app.receivingPause=true;this.element.hidden=false;
      document.body.classList.add('shift-at-dock');
      this.app.input?.suspend();
      this.inert=[];
      for(const node of document.getElementById('shift-game').children)if(node!==this.element&&node.id!=='shift-rotate'&&node.id!=='shift-settings'){this.inert.push([node,node.inert]);node.inert=true;}
      this.door=Math.max(1,this.app.sim.s.map.doors.findIndex(d=>d.id===load.door)+1);
      this.backdrop=this.door%2===0?'trailer-dock-two.png':'trailer-empty.png';
      this.trailerArt=!load.opening&&hash(load.id)%2===0?'trailer-dock-two.png':'trailer-empty.png';
      this.el('door').textContent='DOCK '+pad(this.door);
      this.el('trailer').textContent=load.opening?'Opening stock':'Stock delivery';
      this.el('shipment').textContent='INBOUND / '+pad(load.id)+' / DAY '+this.app.sim.s.day;
      this.el('cargo').textContent=load.cases+' cases. '+load.total+' '+(load.total===1?'pallet.':'pallets.');
      this.resize();this.sync();
      this.element.focus({preventScroll:true});
      this.announce('Dock '+this.door+'. '+load.remaining+' pallets to receive. Select a front pallet.');
    }
    close(focus=true) {
      this.scanning=null;this.departing=null;this.selected=null;this.hover=null;
      this.visible=false;this.app.receivingPause=false;this.element.hidden=true;
      document.body.classList.remove('shift-at-dock');
      for(const [node,old]of this.inert||[])node.inert=old;
      this.inert=[];this.app.input?.suspend();
      if(focus){this.app.scenes?.open('staging');this.app.scenes?.element.focus({preventScroll:true});}
    }
    resize() {
      const rect=this.stage.getBoundingClientRect();if(!rect.width||!rect.height)return;
      this.w=rect.width;this.h=rect.height;this.dpr=Math.min(2,devicePixelRatio||1);
      this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);
      this.scale=Math.min(this.w/1536,this.h/850);
      this.ox=(this.w-1536*this.scale)/2;this.oy=this.w/this.h<1.25?0:(this.h-850*this.scale)/2;
      this.updateTargets();this.draw();
    }
    geometry(p) {
      const rows=Math.max(1,Math.ceil(this.load.total/2));
      const depth=rows===1?0:p.row/Math.max(1,rows-1);
      const width=276-depth*102;
      const cx=p.side===0?600+depth*67:928-depth*67;
      const bottom=650-depth*128;
      const art=variants[O.palletArtIndex(p)];
      const asset=this.images.get(art);if(!asset?.bounds)return null;
      const b=asset.bounds,height=width*b.h/b.w;
      return {p,asset,x:cx-width/2,y:bottom-height,w:width,h:height,depth};
    }
    updateTargets() {
      if(!this.visible||!this.scale)return;
      const records=this.pallets||[];
      this.layout=records.filter(p=>!p.scanned).map(p=>this.geometry(p)).filter(Boolean).sort((a,b)=>b.p.row-a.p.row||a.p.side-b.p.side);
      const parent=this.el('targets');
      for(const [id,node]of this.nodes)if(!records.some(p=>p.id===id&&!p.scanned)){node.remove();this.nodes.delete(id);}
      for(const q of this.layout){const p=q.p;let node=this.nodes.get(p.id);if(!node){node=document.createElement('button');node.className='receiving-target';node.dataset.pallet=p.id;node.addEventListener('click',()=>this.select(p.id));node.addEventListener('focus',()=>{this.hover=p.id;this.draw();});node.addEventListener('blur',()=>{this.hover=null;this.draw();});parent.append(node);this.nodes.set(p.id,node);}
        node.setAttribute('aria-label','Pallet '+pad(p.index+1)+', '+p.cases+' cases of '+p.name+(p.canScan?'':'. '+p.reason));
        node.setAttribute('aria-pressed',String(this.selected===p.id));node.setAttribute('aria-disabled',String(!p.canScan));
        node.tabIndex=p.canScan?0:-1;
        Object.assign(node.style,{left:(this.ox+q.x*this.scale)+'px',top:(this.oy+q.y*this.scale)+'px',width:q.w*this.scale+'px',height:q.h*this.scale+'px'});
      }
    }
    hit(e) {
      const rect=this.canvas.getBoundingClientRect(),x=(e.clientX-rect.left-this.ox)/this.scale,y=(e.clientY-rect.top-this.oy)/this.scale;
      for(const q of [...this.layout].reverse()){
        if(x<q.x||y<q.y||x>=q.x+q.w||y>=q.y+q.h)continue;
        const b=q.asset.bounds,ix=Math.floor(b.x+(x-q.x)/q.w*b.w),iy=Math.floor(b.y+(y-q.y)/q.h*b.h);
        if(q.asset.alpha[(iy*q.asset.image.width+ix)*4+3]>96)return q.p;
      }
      return null;
    }
    select(id) {
      if(this.scanning||this.app.rotated)return;
      const p=this.pallets?.find(p=>p.id===id&&!p.scanned);
      this.selected=p?.id??null;this.notice='';
      this.app.audio.unlock();this.updateTargets();this.updatePanel();this.draw();
      if(p){this.announce(p.canScan?p.name+', '+p.cases+' cases. Ready to scan.':p.reason);if(p.canScan)this.el('scan').focus({preventScroll:true});}
    }
    updatePanel() {
      if(!this.visible)return;
      const p=this.pallets.find(p=>p.id===this.selected&&!p.scanned),complete=!this.load.remaining;
      this.el('pause').textContent=this.app.paused?'Resume':'Pause';this.el('pause').setAttribute('aria-pressed',String(this.app.paused));
      this.el('label').hidden=!p;this.el('complete').hidden=!complete||!!this.departing;
      this.el('count').textContent=this.load.accepted+' / '+this.load.total+' scanned';
      this.el('tally').innerHTML=this.pallets.map(p=>'<i class="'+(p.scanned?'is-received':'')+'"></i>').join('');
      this.el('instruction').textContent=this.app.paused?'Shift paused.':complete?'All pallets scanned.':this.scanning?'Reading pallet label...':p?(p.canScan?'Scan this pallet.':'Receive the front row first.'):'Select a pallet.';
      this.el('help').textContent=this.notice|| (complete?'Unload to Receiving, then put away in the racks.':p?'Match the product, case count and lot.':'Work from the dock toward the back.');
      this.el('complete-copy').textContent=this.load.cases+' cases checked. Return to the floor to unload and put away the stock.';
      if(!p)return;
      this.el('pallet-number').textContent='PALLET '+pad(p.index+1);
      this.el('product').textContent=p.name;this.el('cases').textContent=p.cases;this.el('lot').textContent=p.lot;
      this.el('scan-note').textContent=this.notice||(!p.canScan?p.reason:this.scanning?'Reading label...':'Ready to receive.');
      this.el('scan').disabled=!p.canScan||!!this.scanning||this.app.paused||this.assetFailed;
      this.el('scan').querySelector('span').textContent=this.scanning?'Scanning...':'Scan pallet';
      this.drawBarcode(p);
    }
    drawBarcode(p) {
      const canvas=this.el('barcode');canvas.width=560;canvas.height=126;
      const g=canvas.getContext('2d');g.fillStyle=PAPER;g.fillRect(0,0,560,126);
      const b=O.labels.encode(p.sscc),scale=520/b.width;g.fillStyle=INK;
      for(const bar of b.bars)g.fillRect(20+bar.x*scale,8,bar.w*scale,72);
      g.font='20px "Commit Mono",monospace';g.textAlign='center';g.fillText(b.text,280,115);
    }
    scan() {
      const p=this.pallets.find(p=>p.id===this.selected&&!p.scanned);
      if(!p?.canScan||this.scanning||this.app.paused||this.app.rotated||this.app.hidden||this.assetFailed)return;
      this.app.audio.unlock();this.scanning={id:p.id,time:0,duration:this.reducedMotion()?.12:.7};this.updatePanel();
    }
    reducedMotion() { return this.app.ui.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches; }
    advance(dt) {
      if(!this.visible)return;
      const animated=!!this.scanning||!!this.departing;
      if(!this.app.paused&&!this.app.rotated&&!this.app.hidden&&!this.app.menuPause){
        if(this.scanning){this.scanning.time+=dt;if(this.scanning.time>=this.scanning.duration){
          const id=this.scanning.id,q=this.layout.find(q=>q.p.id===id);
          const result=this.app.sim.command({type:'receivePallet',pallet:id});this.scanning=null;
          if(result.ok){this.app.audio.play('scan');this.departing=q?{q,time:0,duration:this.reducedMotion()?.01:.3}:null;this.selected=null;this.hover=null;this.notice='Pallet '+pad(q.p.index+1)+' scanned. Ready to unload.';this.announce(this.notice);}
          else{this.notice=result.reason;this.app.audio.play('error');this.announce(result.reason);}
          this.stateKey=null;this.sync();
          const next=this.pallets.find(p=>!p.scanned&&p.canScan);
          if(next)this.nodes.get(next.id)?.focus({preventScroll:true});else if(result.ok)this.el('finish').focus({preventScroll:true});
        }}
        if(this.departing){this.departing.time+=dt;if(this.departing.time>=this.departing.duration){this.departing=null;this.updatePanel();if(!this.load.remaining)this.el('finish').focus({preventScroll:true});}}
      }
      if(animated)this.draw();
    }
    draw() {
      if(!this.visible||!this.scale)return;
      const g=this.ctx;g.setTransform(this.dpr,0,0,this.dpr,0,0);g.clearRect(0,0,this.w,this.h);g.fillStyle=PAPER;g.fillRect(0,0,this.w,this.h);
      g.translate(this.ox,this.oy);g.scale(this.scale,this.scale);
      const background=this.images.get(this.backdrop);if(background)g.drawImage(background.image,0,0,1536,1024);
      // The dock stays fixed. Only the trailer interior changes with the shipment.
      const trailer=this.images.get(this.trailerArt);
      if(trailer&&this.trailerArt!==this.backdrop){g.save();g.beginPath();g.rect(414,20,710,632);g.clip();g.drawImage(trailer.image,0,0,1536,1024);g.restore();}
      for(const q of this.layout)this.drawPallet(g,q,1);
      if(this.departing){const {q,time,duration}=this.departing,progress=time/duration;g.save();g.translate(0,progress*30);this.drawPallet(g,q,1-progress);g.restore();}
    }
    drawPallet(g,q,opacity) {
      const {p,asset,x,y,w,h}=q,b=asset.bounds,active=p.id===this.selected||p.id===this.hover;
      g.save();g.globalAlpha=opacity;
      const draw=(dx=0,dy=0)=>g.drawImage(asset.image,b.x,b.y,b.w,b.h,x+dx,y+dy,w,h);
      // Alpha-aware outline follows the generated wooden pallet and cartons, not a rectangle.
      if(active&&p.canScan){g.shadowColor=PAPER;g.shadowBlur=0;for(const [dx,dy]of [[-4,0],[4,0],[0,-4],[0,4]]){g.shadowOffsetX=dx*this.scale*this.dpr;g.shadowOffsetY=dy*this.scale*this.dpr;draw();}g.shadowColor='transparent';}
      if(q.depth>0)g.filter='brightness('+(1-q.depth*.13)+')';
      draw();g.filter='none';
      // A small genuine inventory label is added by the game, keeping AI text out of the artwork.
      const lw=Math.max(41,w*.18),lh=lw*.56,lx=x+w*.17,ly=y+h*.57;
      g.fillStyle=PAPER;g.fillRect(lx,ly,lw,lh);g.fillStyle=INK;
      const barcode=O.labels.encode(p.sscc),scale=(lw-5)/barcode.width;
      for(const bar of barcode.bars)g.fillRect(lx+2+bar.x*scale,ly+3,Math.max(.45,bar.w*scale),lh-10);
      g.font='5px "Commit Mono",monospace';g.textAlign='center';g.fillText(pad(p.index+1),lx+lw/2,ly+lh-2);
      if(active&&p.canScan){g.fillStyle=INK;g.fillRect(x+w/2-28,y-32,56,23);g.fillStyle=PAPER;g.font='13px "Commit Mono",monospace';g.textAlign='center';g.fillText(pad(p.index+1),x+w/2,y-16);}
      if(this.scanning?.id===p.id&&!this.reducedMotion()){const sy=y+12+(h-24)*Math.min(1,this.scanning.time/this.scanning.duration);g.strokeStyle=PAPER;g.lineWidth=3;g.beginPath();g.moveTo(x-7,sy);g.lineTo(x+w+7,sy);g.stroke();g.fillStyle=RUST;g.fillRect(x-10,sy-4,4,8);g.fillRect(x+w+6,sy-4,4,8);}
      g.restore();
    }
    key(e) {
      if(!this.visible)return;
      // Keep game-wide shortcuts from moving the warehouse camera behind the dock.
      e.stopPropagation();
      if(this.app.rotated){e.preventDefault();return;}
      if(e.key==='Escape'){e.preventDefault();if(this.selected&&!this.scanning)this.select(null);else this.close();}
      else if((e.key==='Enter'||e.key===' ')&&e.target===this.canvas){e.preventDefault();this.scan();}
      else if(e.key.toLowerCase()==='s'&&this.selected){e.preventDefault();this.scan();}
      else if(e.key==='Tab'){
        const focusable=[...this.element.querySelectorAll('button:not(:disabled)')].filter(n=>n.tabIndex>=0&&n.getClientRects().length),first=focusable[0],last=focusable.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
    announce(text) { this.el('live').textContent=text; }
    suspend() { this.hover=null;this.draw(); }
  }
  O.ReceivingView=ReceivingView;
  const P=O.UI.prototype,update=P.update,select=P.select,action=P.action;
  P.update=function(){const result=update.apply(this,arguments);this.app.receiving?.sync();return result;};
  P.select=function(hit){const t=hit?.kind==='truck'&&this.app.sim.t.get(hit.id);if(t?.supplier&&t.status==='docked'&&this.app.receiving){this.app.receiving.open(t.id);return;}return select.apply(this,arguments);};
  P.action=function(node){const result=action.apply(this,arguments);if(node.dataset.action==='new'&&O.business(this.app.sim.s))this.app.receiving?.attach(true);return result;};
})(window);
