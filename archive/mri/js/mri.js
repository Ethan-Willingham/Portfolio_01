// Fixed-window JPEG slice sheets and illustrative MRI-derived surface meshes.
// The external 3D library loads independently so a failure leaves slices usable.
const MRI_BASE = 'assets/mri/';
const NIIVUE_URL = 'https://esm.sh/@niivue/niivue@0.69.0';
const $ = (id) => document.getElementById(id);

/* ---------------- 2D slice viewer ---------------- */
class SliceViewer {
  constructor(manifest, els) {
    this.series = manifest.slice_series;
    this.regions = manifest.regions;
    this.els = els;
    this.cur = null; this.img = null; this.idx = 0;
    this.playing = false; this.timer = null; this.cache = new Map();
    this.loadId = 0;
    this.canvas = els.canvas; this.ctx = this.canvas.getContext('2d');
    this.hintShown = true;
    this._bind();
    this.selectRegion(this.regions[0]);
  }

  _bind() {
    const e = this.els;
    e.slider.addEventListener('input', () => this.setIdx(+e.slider.value));
    e.play.addEventListener('click', () => this.togglePlay());
    this.canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); this.step(ev.deltaY > 0 ? 1 : -1); }, { passive: false });

    let dragY = null, startIdx = 0;
    const down = (y) => { dragY = y; startIdx = this.idx; this.stop(); };
    const move = (y) => {
      if (dragY === null || !this.cur) return;
      const dpp = this.canvas.clientHeight / Math.max(this.cur.count, 1);
      this.setIdx(startIdx + Math.round((y - dragY) / Math.max(dpp * 0.6, 4)));
    };
    const up = () => { dragY = null; };
    this.canvas.addEventListener('mousedown', (ev) => down(ev.clientY));
    window.addEventListener('mousemove', (ev) => move(ev.clientY));
    window.addEventListener('mouseup', up);
    this.canvas.addEventListener('touchstart', (ev) => down(ev.touches[0].clientY), { passive: true });
    this.canvas.addEventListener('touchmove', (ev) => move(ev.touches[0].clientY), { passive: true });
    this.canvas.addEventListener('touchend', up);
    this.canvas.addEventListener('touchcancel', up);
  }

  selectRegion(region) {
    this.region = region;
    const labels = { brain: 'Brain', cervical: 'Neck', lumbar: 'Lower back' };
    this.els.tabs.innerHTML = '';
    this.regions.forEach((r) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.region = r;
      b.className = 'tz-btn' + (r === region ? ' active' : '');
      b.textContent = labels[r] || r;
      b.setAttribute('aria-pressed', String(r === region));
      b.onclick = () => this.selectRegion(r);
      this.els.tabs.appendChild(b);
    });
    const list = this.series.filter((s) => s.region === region);
    this.els.seriesRow.innerHTML = '';
    list.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'mri-chip';
      b.textContent = s.label; b.dataset.id = s.id;
      b.onclick = () => this.selectSeries(s.id);
      this.els.seriesRow.appendChild(b);
    });
    if (list.length) this.selectSeries(list[0].id);
  }

  selectSeries(id) {
    const s = this.series.find((x) => x.id === id);
    if (!s) return;
    this.stop();
    const loadId = ++this.loadId;
    this.cur = s; this.img = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    [...this.els.seriesRow.children].forEach((b) => {
      const active = b.dataset.id === id;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    this.els.slider.max = s.count - 1;
    this.idx = Math.floor(s.count / 2);
    this.els.slider.value = this.idx;
    this.els.slider.disabled = true; this.els.play.disabled = true;
    this.els.count.textContent = 'Loading';
    this.els.ovLabel.textContent = s.label;
    this.els.ovRegion.textContent = this.region.toUpperCase();
    this.canvas.setAttribute('aria-label', s.label + ', ' + this.region);
    this.els.headerReadout.textContent = s.count + ' slices';
    this.els.loading.textContent = 'Loading slice sheet';
    this.els.loading.classList.remove('hidden', 'failed');
    const draw = (img) => {
      if (loadId !== this.loadId) return;
      this.img = img;
      this.els.slider.disabled = false; this.els.play.disabled = false;
      this.els.loading.classList.add('hidden');
      this.draw();
    };
    if (this.cache.has(id)) { draw(this.cache.get(id)); return; }
    const img = new Image();
    img.onload = () => { this.cache.set(id, img); draw(img); };
    img.onerror = () => {
      if (loadId !== this.loadId) return;
      this.els.loading.textContent = 'This slice sheet could not load. Try another series.';
      this.els.loading.classList.add('failed');
      this.els.count.textContent = 'Unavailable';
    };
    img.src = MRI_BASE + s.file;
  }

  setIdx(i) {
    if (!this.cur || !this.img) return;
    this.idx = Math.max(0, Math.min(this.cur.count - 1, i));
    this.els.slider.value = this.idx;
    this.draw();
    if (this.hintShown && this.els.hint) { this.els.hint.style.opacity = '0'; this.hintShown = false; }
  }
  step(d) { this.setIdx(this.idx + d); }

  draw() {
    if (!this.img || !this.cur) return;
    const s = this.cur;
    const col = this.idx % s.cols, row = Math.floor(this.idx / s.cols);
    if (this.canvas.width !== s.tile_w || this.canvas.height !== s.tile_h) {
      this.canvas.width = s.tile_w; this.canvas.height = s.tile_h;
    }
    this.ctx.clearRect(0, 0, s.tile_w, s.tile_h);
    this.ctx.drawImage(this.img, col * s.tile_w, row * s.tile_h, s.tile_w, s.tile_h, 0, 0, s.tile_w, s.tile_h);
    this.els.count.textContent = (this.idx + 1) + ' / ' + s.count;
    this.els.slider.setAttribute('aria-valuetext', 'Slice ' + (this.idx + 1) + ' of ' + s.count);
  }

  togglePlay() { this.playing ? this.stop() : this.start(); }
  start() {
    if (!this.cur || !this.img || this.playing) return;
    this.playing = true;
    this.els.play.classList.add('playing');
    this.els.play.textContent = 'Pause';
    this.els.play.setAttribute('aria-label', 'Pause slices');
    this.els.play.setAttribute('aria-pressed', 'true');
    this.timer = setInterval(() => this.setIdx((this.idx + 1) % this.cur.count), 90);
  }
  stop() {
    this.playing = false;
    this.els.play.classList.remove('playing');
    this.els.play.textContent = 'Play';
    this.els.play.setAttribute('aria-label', 'Play slices');
    this.els.play.setAttribute('aria-pressed', 'false');
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}

/* ---------------- 3D surface viewer (NiiVue) ---------------- */
const SCENES = {
  brain: {
    mesh: MRI_BASE + 'meshes/brain.mz3',
    meshRGBA: [225, 220, 208, 255],
    caption: 'Brain: processed T1-derived surface. Filled spaces and smoothing alter the anatomy.',
  },
  spine: {
    mesh: MRI_BASE + 'meshes/spine.mz3',
    meshRGBA: [228, 222, 214, 255],
    caption: 'Spine / torso: rough surface envelope from a localizer, not a model of individual vertebrae.',
  },
};

class Surface3D {
  constructor(canvas, els, Niivue) {
    this.canvas = canvas; this.els = els; this.Niivue = Niivue;
    this.scene = 'brain'; this.requestedScene = 'brain';
    this.az = 120; this.el = 12; this.rotating = true;
    this.ready = false; this._looping = false; this.loadingScene = false;
    this.sceneQueue = Promise.resolve();
  }

  async init() {
    this.nv = new this.Niivue({ backColor: [0.102, 0.125, 0.110, 1], show3Dcrosshair: false, isColorbar: false, isOrientCube: false });
    await this.nv.attachToCanvas(this.canvas);
    this.nv.setSliceType(4);
    await this.loadScene('brain');
    this.ready = true;
    this._startLoop();
  }

  loadScene(name) {
    if (!SCENES[name]) return this.sceneQueue;
    this.requestedScene = name;
    this.els.loading.classList.remove('hidden', 'failed');
    this.els.loading.textContent = 'Loading model';
    // NiiVue mutates its mesh list while loading. Serial requests keep the last
    // selected model from being replaced by an older, slower response.
    this.sceneQueue = this.sceneQueue.catch(() => {}).then(async () => {
      if (name !== this.requestedScene) return;
      this.loadingScene = true;
      try {
        const s = SCENES[name];
        await this.nv.loadMeshes([{ url: s.mesh, rgba255: s.meshRGBA }]);
        if (name !== this.requestedScene) return;
        this.scene = name;
        this.az = name === 'brain' ? 120 : 110; this.el = 12;
        this.nv.setRenderAzimuthElevation(this.az, this.el);
        this.els.caption.textContent = s.caption;
        this.nv.drawScene();
        this.els.loading.classList.add('hidden');
      } catch (e) {
        if (name === this.requestedScene) {
          this.els.loading.textContent = 'This model could not load. Try the other region.';
          this.els.loading.classList.add('failed');
        }
        throw e;
      } finally { this.loadingScene = false; }
    });
    return this.sceneQueue;
  }

  setRotate(on) { this.rotating = on; if (on) this._startLoop(); }

  _startLoop() {
    if (this._looping) return;
    this._looping = true;
    const tick = () => {
      if (!this.rotating) { this._looping = false; return; }
      if (this.ready && !this.loadingScene) {
        this.az = (this.az + 0.35) % 360;
        this.nv.setRenderAzimuthElevation(this.az, this.el);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/* ---------------- independent initialization ---------------- */
async function initSlices() {
  try {
    const response = await fetch(MRI_BASE + 'manifest.json');
    if (!response.ok) throw new Error('Manifest HTTP ' + response.status);
    const manifest = await response.json();
    new SliceViewer(manifest, {
      canvas: $('slice-canvas'), tabs: $('region-tabs'), seriesRow: $('series-row'),
      slider: $('slice-slider'), play: $('play-btn'),
      count: $('slice-count'), headerReadout: $('slice-readout'),
      ovLabel: $('ov-label'), ovRegion: $('ov-region'),
      loading: $('loading-2d'), hint: $('hint-2d'),
    });
  } catch (e) {
    $('loading-2d').textContent = 'The slice viewer could not load its image list.';
    $('loading-2d').classList.add('failed');
    console.error('Slice viewer unavailable', e);
  }
}

async function initSurfaces() {
  try {
    const { Niivue } = await import(NIIVUE_URL);
    const v3d = new Surface3D($('nv-canvas'), { loading: $('loading-3d'), caption: $('nv-caption') }, Niivue);
    await v3d.init();
    [...$('scene-group').children].forEach((b) => { b.disabled = false; });
    $('rotate-chk').disabled = false;
    $('scene-group').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-scene]'); if (!b) return;
      [...$('scene-group').children].forEach((x) => {
        x.classList.toggle('active', x === b);
        x.setAttribute('aria-pressed', String(x === b));
      });
      v3d.loadScene(b.dataset.scene).catch((e) => console.warn('Model unavailable', e));
    });
    $('rotate-chk').addEventListener('change', (ev) => v3d.setRotate(ev.target.checked));
  } catch (e) {
    $('loading-3d').textContent = 'The 3D viewer is unavailable. It needs WebGL2 and its external library. The slices can still be used.';
    $('loading-3d').classList.add('failed');
    $('nv-readout').textContent = '3D unavailable';
    console.warn('3D viewer unavailable', e);
  }
}

initSlices();
initSurfaces();
