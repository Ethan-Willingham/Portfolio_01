(function (root) {
  'use strict';
  const O = root.OneShift;
  const PAPER = '#f0e1c6', INK = '#252620', RUST = '#a44a2d';
  const ART = 'assets/one-shift/';
  const VARIANTS = ['pallet-cargo.png', 'pallet-mixed.png', 'pallet-low.png', 'pallet-tall.png'];
  const SCENES = {
    staging: {name: 'Receiving floor', image: 'staging.webp', openImage:'staging-open.webp', door:[209,42,405,473], maxHeight: 410, slots: [[266, 730, 310], [770, 730, 310], [1270, 730, 310]]},
    storage: {name: 'Storage aisle', image: 'storage.webp', maxHeight: 480, slots: [[350, 690, 300], [770, 690, 300], [1180, 690, 300]]},
    shipping: {name: 'Shipping floor', image: 'shipping.webp', openImage:'shipping-open.webp', door:[593,58,382,462], maxHeight: 400, slots: [[275, 752, 310], [760, 752, 310], [1265, 752, 310]]}
  };

  class WarehouseScenes {
    constructor(app) {
      this.app = app;
      this.scene = 'staging';
      this.page = 0;
      this.selected = null;
      this.hover = null;
      this.images = new Map();
      this.nodes = new Map();
      this.layout = [];
      this.dirty = true;
      this.lastSync = -Infinity;
      this.element = document.createElement('section');
      this.element.id = 'shift-scenes';
      this.element.tabIndex = -1;
      this.element.setAttribute('aria-label', 'Warehouse scenes');
      this.element.innerHTML = `
        <header class="scene-heading">
          <div><h2 id="scene-title">Receiving floor</h2><p id="scene-work">Unload, then put stock away.</p></div>
          <div class="scene-pages" aria-label="Areas in this scene"><button id="scene-prev" aria-label="Previous area">Prev</button><output id="scene-page">1 / 1</output><button id="scene-next" aria-label="Next area">Next</button></div>
        </header>
        <div class="scene-stage">
          <canvas id="scene-canvas" aria-hidden="true"></canvas>
          <div id="scene-targets" aria-label="Pallets in this area"></div>
          <p id="scene-empty" class="scene-empty" hidden></p>
          <div id="scene-loading" role="status"><p>Opening the warehouse...</p><button id="scene-retry" hidden>Try again</button></div>
          <aside id="scene-label" class="scene-label" aria-labelledby="scene-product" hidden>
            <div class="scene-label-head"><span id="scene-pallet">PALLET</span><button id="scene-deselect" aria-label="Close pallet details">Close</button></div>
            <h3 id="scene-product"></h3>
            <dl><div><dt>CASES</dt><dd id="scene-cases"></dd></div><div><dt>LOT</dt><dd id="scene-lot"></dd></div><div><dt>BEST BY</dt><dd id="scene-best-by"></dd></div><div><dt>LOCATION</dt><dd id="scene-place"></dd></div></dl>
            <p id="scene-status"></p>
            <canvas id="scene-barcode" aria-label="Pallet barcode"></canvas>
          </aside>
        </div>
        <nav class="scene-nav" aria-label="Warehouse areas">${Object.entries(SCENES).map(([id, value]) => '<button data-scene="'+id+'" aria-pressed="'+(id === 'staging')+'">'+value.name+'</button>').join('')}</nav>
        <p id="scene-live" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>`;
      document.getElementById('shift-game').append(this.element);
      this.canvas = this.el('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.stage = this.element.querySelector('.scene-stage');
      this.el('prev').addEventListener('click', () => this.changePage(-1));
      this.el('next').addEventListener('click', () => this.changePage(1));
      this.el('deselect').addEventListener('click', () => this.select(null, true));
      this.el('retry').addEventListener('click', () => this.load());
      this.element.querySelectorAll('[data-scene]').forEach(node => node.addEventListener('click', () => this.open(node.dataset.scene)));
      this.element.addEventListener('click', e => e.stopPropagation());
      this.element.addEventListener('keydown', e => this.key(e));
      this.canvas.addEventListener('pointermove', e => {
        if (e.pointerType === 'touch' || this.blocked()) return;
        const id = this.hit(e)?.id ?? null;
        if (id !== this.hover) { this.hover = id; this.dirty = true; this.canvas.style.cursor = id === null ? 'default' : 'pointer'; this.paint(); }
      });
      this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.dirty = true; this.paint(); });
      this.canvas.addEventListener('pointerup', e => {
        if (this.blocked() || e.button > 0) return;
        this.select(this.hit(e)?.id ?? null);
      });
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.stage);
      this.ready = this.load();
      this.resize();
      this.sync(true);
    }

    el(name) { return this.element.querySelector('#scene-' + name); }
    blocked() { return this.app.rotated || this.app.hidden || this.app.receiving?.visible || this.app.hubPause || this.app.menuPause; }

    async load() {
      this.assetFailed = false;
      this.el('loading').hidden = false;
      this.el('loading').querySelector('p').textContent = 'Opening the warehouse...';
      this.el('retry').hidden = true;
      try {
        await Promise.all([
          ...Object.values(SCENES).map(scene => this.loadImage(scene.image, false)),
          ...Object.values(SCENES).filter(scene=>scene.openImage).map(scene=>this.loadImage(scene.openImage,false)),
          ...VARIANTS.map(name => this.loadImage(name, true))
        ]);
        this.el('loading').hidden = true;
        this.dirty = true;
        this.updateTargets();
        this.paint();
      } catch (error) {
        this.assetFailed = true;
        this.el('loading').querySelector('p').textContent = 'The warehouse artwork could not load.';
        this.el('retry').hidden = false;
      }
    }

    async loadImage(name, pallet) {
      if (this.images.has(name)) return;
      if (pallet && this.app.receiving?.ready) await this.app.receiving.ready;
      const shared = pallet && this.app.receiving?.images?.get(name);
      if (shared) { this.images.set(name, shared); return; }
      const image = new Image();
      image.src = ART + (pallet ? 'receiving/' + name.replace('.png', '.webp') : 'scenes/' + name) + '?v=1';
      await image.decode();
      const asset = {image};
      if (pallet) {
        // Read the original alpha for selection. The generated source is never altered.
        const mask = document.createElement('canvas');
        mask.width = image.width; mask.height = image.height;
        const g = mask.getContext('2d', {willReadFrequently: true});
        g.drawImage(image, 0, 0);
        const pixels = g.getImageData(0, 0, image.width, image.height).data;
        let x0 = image.width, y0 = image.height, x1 = 0, y1 = 0;
        for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (pixels[(y * image.width + x) * 4 + 3] > 96) {
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
        }
        asset.bounds = {x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1};
        asset.alpha = pixels;
      }
      this.images.set(name, asset);
    }

    open(scene) {
      if (!SCENES[scene]) return;
      const changed = this.scene !== scene;
      this.scene = scene;
      if (changed) this.page = 0;
      this.selected = null; this.hover = null;
      this.stateKey = null;
      this.sync(true); this.resize();
      this.announce(this.snapshot?.title || SCENES[scene].name);
    }

    changePage(direction) {
      if (this.blocked() || !this.snapshot) return;
      this.page = Math.max(0, Math.min(this.snapshot.pages - 1, this.page + direction));
      this.selected = null; this.hover = null;
      this.sync(true);
      this.announce(this.snapshot.title + ', area ' + (this.page + 1) + ' of ' + this.snapshot.pages + '.');
    }

    sync(force = false) {
      if (typeof O.sceneSnapshot !== 'function') return;
      const now = performance.now();
      if (!force && now - this.lastSync < 100) return;
      this.lastSync = now;
      const snapshot = O.sceneSnapshot(this.app.sim, this.scene, this.page);
      if (!snapshot) return;
      const truck=this.app.sim.s.trucks.find(t=>t.direction===(this.scene==='staging'?'in':'out')&&t.status==='docked'&&t.closingTick==null);
      snapshot.dock=this.scene!=='storage'&&truck?{id:truck.id,number:this.app.sim.s.map.doors.findIndex(d=>d.id===truck.door)+1,pallets:this.app.sim.s.pallets.filter(p=>this.scene==='staging'?truck.manifest.includes(p.id)&&p.place==='trailer':p.place==='shipped'&&truck.loaded.some(q=>q.pallet===p.id)).map(p=>({id:p.id,item:p.item,cases:p.cases,sscc:p.sscc}))}:null;
      const stateKey = JSON.stringify(snapshot);
      if (!force && stateKey === this.stateKey) return;
      this.stateKey = stateKey;
      this.snapshot = snapshot;
      this.page = snapshot.page;
      const oldSelected = this.selected;
      if (!snapshot.pallets.some(p => p.id === this.selected)) this.selected = null;
      if (!snapshot.pallets.some(p => p.id === this.hover)) this.hover = null;
      this.el('title').textContent = snapshot.title || SCENES[this.scene].name;
      this.el('work').textContent = (snapshot.dock?'Dock '+snapshot.dock.number+' / ':'')+(snapshot.work[0] || snapshot.subtitle);
      this.el('work').title = snapshot.work.join(' / ') || snapshot.subtitle;
      this.el('page').textContent = (snapshot.page + 1) + ' / ' + snapshot.pages;
      this.el('prev').disabled = snapshot.page <= 0;
      this.el('next').disabled = snapshot.page + 1 >= snapshot.pages;
      this.el('empty').hidden = snapshot.pallets.length > 0;
      this.el('empty').textContent = snapshot.dock?.pallets.length&&this.scene==='shipping'?'The load is on the truck.':snapshot.work.length&&this.scene==='shipping'?'Shipping floor clear.':snapshot.emptyText;
      this.element.querySelectorAll('[data-scene]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.scene === this.scene)));
      this.updateTargets(); this.updatePanel();
      this.dirty = true;
      if (oldSelected !== null && this.selected === null) this.announce('That pallet has moved. ' + (snapshot.work[0] || snapshot.emptyText));
      this.paint();
    }

    resize() {
      const rect = this.stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this.w = rect.width; this.h = rect.height;
      this.dpr = Math.min(2, root.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      // Fill the width and crop spare wall and foreground on short screens. Keep all pallet slots.
      this.scale = this.w / 1536;
      this.ox = (this.w - 1536 * this.scale) / 2;
      this.oy = Math.min(0, Math.max(this.h - 1024 * this.scale, this.h / 2 - 490 * this.scale));
      this.updateTargets(); this.dirty = true; this.paint();
    }

    geometry(p, index) {
      const slot = SCENES[this.scene].slots[p.slot ?? index];
      if (!slot) return null;
      const variant = O.palletArtIndex(p);
      const asset = this.images.get(VARIANTS[variant]);
      if (!asset?.bounds) return null;
      const b = asset.bounds;
      const w = Math.min(slot[2], SCENES[this.scene].maxHeight * b.w / b.h), h = w * b.h / b.w;
      return {p, asset, x: slot[0] - w / 2, y: slot[1] - h, w, h};
    }

    updateTargets() {
      if (!this.snapshot || !this.scale) return;
      this.layout = this.snapshot.pallets.map((p, i) => this.geometry(p, i)).filter(Boolean);
      const parent = this.el('targets');
      const visible = new Set(this.layout.map(q => q.p.id));
      for (const [id, node] of this.nodes) if (!visible.has(id)) { node.remove(); this.nodes.delete(id); }
      for (const q of this.layout) {
        const p = q.p;
        let node = this.nodes.get(p.id);
        if (!node) {
          node = document.createElement('button');
          node.className = 'scene-target';
          node.dataset.pallet = p.id;
          node.addEventListener('click', () => this.select(p.id));
          node.addEventListener('focus', () => { this.hover = p.id; this.dirty = true; this.paint(); });
          node.addEventListener('blur', () => { this.hover = null; this.dirty = true; this.paint(); });
          parent.append(node); this.nodes.set(p.id, node);
        }
        node.setAttribute('aria-label', p.name + ', ' + p.cases + ' cases, lot ' + p.lot + '. ' + p.status + '. Inspect pallet.');
        node.setAttribute('aria-pressed', String(this.selected === p.id));
        node.tabIndex = p.selectable === false ? -1 : 0;
        const width = Math.max(44, q.w * this.scale), height = Math.max(44, q.h * this.scale);
        Object.assign(node.style, {left: (this.ox + (q.x + q.w / 2) * this.scale - width / 2) + 'px', top: (this.oy + (q.y + q.h / 2) * this.scale - height / 2) + 'px', width: width + 'px', height: height + 'px'});
      }
    }

    hit(e) {
      if (!this.scale) return null;
      const rect = this.canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left - this.ox) / this.scale, y = (e.clientY - rect.top - this.oy) / this.scale;
      for (const q of [...this.layout].reverse()) {
        if (q.p.selectable === false || x < q.x || y < q.y || x >= q.x + q.w || y >= q.y + q.h) continue;
        const b = q.asset.bounds;
        const ix = Math.floor(b.x + (x - q.x) / q.w * b.w), iy = Math.floor(b.y + (y - q.y) / q.h * b.h);
        if (q.asset.alpha[(iy * q.asset.image.width + ix) * 4 + 3] > 96) return q.p;
      }
      // Small touch targets expand only after checking every exact silhouette, so a nearby load wins.
      if (e.pointerType === 'touch') {
        for (const q of this.layout) {
          const width = Math.max(q.w, 44 / this.scale), height = Math.max(q.h, 44 / this.scale);
          if (q.p.selectable !== false && Math.abs(x - q.x - q.w / 2) < width / 2 && Math.abs(y - q.y - q.h / 2) < height / 2) return q.p;
        }
      }
      return null;
    }

    select(id, restoreFocus = false) {
      if (this.blocked()) return;
      const oldSelected = this.selected;
      const p = this.snapshot?.pallets.find(p => p.id === id && p.selectable !== false);
      this.selected = p?.id ?? null;
      this.app.audio?.unlock();
      this.updateTargets(); this.updatePanel(); this.dirty = true; this.paint();
      if (p) {
        this.announce(p.name + ', ' + p.cases + ' cases. Lot ' + p.lot + '. ' + p.status + '.');
        this.el('deselect').focus({preventScroll: true});
      } else if (restoreFocus) this.nodes.get(oldSelected)?.focus({preventScroll: true});
    }

    updatePanel() {
      const p = this.snapshot?.pallets.find(p => p.id === this.selected);
      this.el('label').hidden = !p;
      if (!p) return;
      this.el('pallet').textContent = 'PALLET ' + p.id;
      this.el('product').textContent = p.name;
      this.el('cases').textContent = p.cases;
      this.el('lot').textContent = p.lot;
      this.el('best-by').textContent = p.bestBy ? 'Day ' + p.bestBy : 'No expiry';
      this.el('place').textContent = p.place === 'transit' ? 'In transit' : p.rack ? 'Rack ' + p.rack + (p.level ? ', level ' + (p.level + 1) : '') : SCENES[this.scene].name;
      this.el('status').textContent = p.status;
      const canvas = this.el('barcode');
      canvas.hidden = !p.sscc || !O.labels;
      if (!canvas.hidden) {
        canvas.width = 560; canvas.height = 110;
        const g = canvas.getContext('2d'), code = O.labels.encode(p.sscc), scale = 520 / code.width;
        g.fillStyle = PAPER; g.fillRect(0, 0, 560, 110); g.fillStyle = INK;
        for (const bar of code.bars) g.fillRect(20 + bar.x * scale, 5, bar.w * scale, 65);
        g.font = '18px "Commit Mono",monospace'; g.textAlign = 'center'; g.fillText(code.text, 280, 99);
        canvas.setAttribute('aria-label', 'Pallet barcode ' + code.text);
      }
    }

    draw() { this.sync(); this.paint(); }
    advance() { this.draw(); }

    paint() {
      if (!this.dirty || !this.scale || this.app.receiving?.visible) return;
      this.dirty = false;
      const g = this.ctx;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, this.w, this.h); g.fillStyle = PAPER; g.fillRect(0, 0, this.w, this.h);
      g.translate(this.ox, this.oy); g.scale(this.scale, this.scale);
      const background = this.images.get(SCENES[this.scene].image);
      if (background) g.drawImage(background.image, 0, 0, 1536, 1024);
      const scene=SCENES[this.scene],open=this.images.get(scene.openImage);
      if(this.snapshot?.dock&&open){
        const [dx,dy,dw,dh]=scene.door;
        // Only the aperture changes; all surrounding paper grain stays registered.
        g.drawImage(open.image,dx,dy,dw,dh,dx,dy,dw,dh);
        g.save();g.beginPath();g.rect(dx,dy,dw,dh);g.clip();
        const cargo=this.snapshot.dock.pallets.slice(0,6);
        for(let i=cargo.length-1;i>=0;i--){const p=cargo[i],asset=this.images.get(VARIANTS[O.palletArtIndex(p)]);if(!asset?.bounds)continue;const row=Math.floor(i/2),w=dw*(.38-row*.045),h=w*asset.bounds.h/asset.bounds.w,x=dx+dw*(i%2?.71:.29)-w/2,y=dy+dh-8-row*48-h;this.drawPallet(g,{p,asset,x,y,w,h});}
        g.restore();
      }
      for (const q of this.layout) this.drawPallet(g, q);
    }

    drawPallet(g, q) {
      const {p, asset, x, y, w, h} = q, b = asset.bounds;
      const active = p.id === this.selected || p.id === this.hover;
      const draw = () => g.drawImage(asset.image, b.x, b.y, b.w, b.h, x, y, w, h);
      g.save();
      // Native alpha edges produce a printed silhouette, without a rectangular hit overlay.
      if (active) {
        g.shadowBlur = 0; g.shadowColor = PAPER;
        for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) {
          g.shadowOffsetX = dx * this.scale * this.dpr; g.shadowOffsetY = dy * this.scale * this.dpr; draw();
        }
        g.shadowColor = RUST;
        for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
          g.shadowOffsetX = dx * this.scale * this.dpr; g.shadowOffsetY = dy * this.scale * this.dpr; draw();
        }
        g.shadowColor = 'transparent'; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
      }
      draw();
      if (p.sscc && O.labels) {
        const lw = Math.max(42, w * .19), lh = lw * .5, lx = x + w * .18, ly = y + h * .58;
        g.fillStyle = PAPER; g.fillRect(lx, ly, lw, lh); g.fillStyle = INK;
        const code = O.labels.encode(p.sscc), scale = (lw - 6) / code.width;
        for (const bar of code.bars) g.fillRect(lx + 3 + bar.x * scale, ly + 3, Math.max(.45, bar.w * scale), lh - 6);
      }
      if (active) {
        const text = p.cases + ' CASES';
        g.font = '16px "Commit Mono",monospace';
        const width = g.measureText(text).width + 20;
        g.fillStyle = INK; g.fillRect(x + w / 2 - width / 2, y - 36, width, 26);
        g.fillStyle = PAPER; g.textAlign = 'center'; g.fillText(text, x + w / 2, y - 17);
      }
      g.restore();
    }

    key(e) {
      if (this.blocked()) return;
      if (e.key === 'Escape' && this.selected !== null) { e.preventDefault(); e.stopPropagation(); this.select(null, true); }
      else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) && e.target.matches('.scene-target')) {
        e.preventDefault(); e.stopPropagation();
        const targets = [...this.nodes.values()].filter(node => node.tabIndex >= 0), index = targets.indexOf(e.target);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? targets.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + targets.length) % targets.length;
        targets[next]?.focus({preventScroll: true});
      }
    }

    announce(text) { this.el('live').textContent = text; }
    suspend() { this.hover = null; this.dirty = true; this.paint(); }
  }

  O.WarehouseScenes = WarehouseScenes;
})(window);
