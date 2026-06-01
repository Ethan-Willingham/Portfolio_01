// MRI viewer, 2D slice stacks + NiiVue 3D reconstruction.
// Loaded as a module by mri.html. Assets live under assets/mri/.
import { Niivue } from 'https://esm.sh/@niivue/niivue@0.69.0';

const MRI_BASE = 'assets/mri/';
const $ = (id) => document.getElementById(id);

/* ---------------- 2D slice viewer ---------------- */
class SliceViewer {
  constructor(manifest, els) {
    this.series = manifest.slice_series;
    this.regions = manifest.regions;
    this.els = els;
    this.cur = null; this.img = null; this.idx = 0;
    this.playing = false; this.timer = null; this.cache = new Map();
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
  }

  selectRegion(region) {
    this.region = region;
    this.els.tabs.innerHTML = '';
    this.regions.forEach((r) => {
      const b = document.createElement('button');
      b.className = 'tz-btn' + (r === region ? ' active' : '');
      b.textContent = r[0].toUpperCase() + r.slice(1);
      b.onclick = () => this.selectRegion(r);
      this.els.tabs.appendChild(b);
    });
    const list = this.series.filter((s) => s.region === region);
    this.els.seriesRow.innerHTML = '';
    list.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'mri-chip' + (i === 0 ? ' active' : '');
      b.textContent = s.label; b.dataset.id = s.id;
      b.onclick = () => this.selectSeries(s.id);
      this.els.seriesRow.appendChild(b);
    });
    if (list.length) this.selectSeries(list[0].id);
  }

  selectSeries(id) {
    const s = this.series.find((x) => x.id === id);
    if (!s) return;
    this.cur = s;
    [...this.els.seriesRow.children].forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    this.els.slider.max = s.count - 1;
    this.idx = Math.floor(s.count / 2);
    this.els.slider.value = this.idx;
    this.els.ovLabel.textContent = s.label;
    this.els.ovRegion.textContent = this.region.toUpperCase();
    this.els.headerReadout.textContent = s.count + ' slices';
    this.els.loading.classList.remove('hidden');
    const draw = (img) => { this.img = img; this.els.loading.classList.add('hidden'); this.draw(); };
    if (this.cache.has(id)) { draw(this.cache.get(id)); return; }
    const img = new Image();
    img.onload = () => { this.cache.set(id, img); draw(img); };
    img.onerror = () => { this.els.loading.textContent = 'failed to load'; };
    img.src = MRI_BASE + s.file;
  }

  setIdx(i) {
    if (!this.cur) return;
    this.idx = Math.max(0, Math.min(this.cur.count - 1, i));
    this.els.slider.value = this.idx;
    this.draw();
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
    if (this.hintShown && this.els.hint) { this.els.hint.style.opacity = '0'; this.hintShown = false; }
  }

  togglePlay() { this.playing ? this.stop() : this.start(); }
  start() {
    if (!this.cur) return;
    this.playing = true;
    this.els.play.classList.add('playing');
    this.els.play.innerHTML = '&#10074;&#10074;';
    this.timer = setInterval(() => this.setIdx((this.idx + 1) % this.cur.count), 90);
  }
  stop() {
    this.playing = false;
    this.els.play.classList.remove('playing');
    this.els.play.innerHTML = '&#9654;';
    if (this.timer) clearInterval(this.timer);
  }
}

/* ---------------- 3D viewer (NiiVue) ---------------- */
const ST = { MULTIPLANAR: 3, RENDER: 4 };
const SCENES = {
  brain: {
    vol: MRI_BASE + 'volumes/brain.nii.gz',
    mesh: MRI_BASE + 'meshes/brain.mz3',
    meshRGBA: [225, 220, 208, 255],
    caption: 'Brain: a T1 scan AI-super-resolved to 0.9 mm isotropic, skull-stripped into a cortical surface.',
  },
  spine: {
    vol: MRI_BASE + 'volumes/spine_scout.nii.gz',
    mesh: MRI_BASE + 'meshes/spine.mz3',
    meshRGBA: [228, 222, 214, 255],
    caption: 'Spine / torso: a stylized surface envelope reconstructed from the localizer (MRI cannot resolve bone).',
  },
};

class Volume3D {
  constructor(canvas, els) {
    this.canvas = canvas; this.els = els;
    this.scene = 'brain'; this.mode = 'mesh';
    this.az = 120; this.el = 12; this.rotating = true;
    this.ready = false; this._looping = false;
  }

  async init() {
    this.nv = new Niivue({ backColor: [0.102, 0.125, 0.110, 1], show3Dcrosshair: false, isColorbar: false, isOrientCube: false });
    await this.nv.attachToCanvas(this.canvas);
    await this.loadScene('brain');
    this.ready = true;
    this.els.loading.classList.add('hidden');
    this._startLoop();
  }

  async loadScene(name) {
    this.scene = name;
    const s = SCENES[name];
    this.els.loading.classList.remove('hidden');
    this.els.loading.textContent = 'loading model';
    try { await this.nv.loadMeshes([{ url: s.mesh, rgba255: s.meshRGBA }]); }
    catch (e) { console.warn('mesh load failed', e); }
    this.az = name === 'brain' ? 120 : 110; this.el = 12;
    this.els.caption.textContent = s.caption;
    this.applyMode();
    this.els.loading.classList.add('hidden');
  }

  _setVolumeOpacity(op) {
    if (!this.nv.volumes.length) return;
    this.nv.volumes[0].opacity = op;
    this.nv.updateGLVolume();
  }
  _setMeshVisible(v) { this.nv.meshes.forEach((m) => { m.visible = v; }); this.nv.drawScene(); }

  applyMode() {
    const nv = this.nv;
    if (this.mode === 'mpr') {
      this._setVolumeOpacity(1); this._setMeshVisible(false);
      nv.setSliceType(ST.MULTIPLANAR);
      this.els.hint.textContent = 'axial · coronal · sagittal';
    } else {
      nv.setSliceType(ST.RENDER);
      this._setVolumeOpacity(this.mode === 'volume' ? 1 : (this.mode === 'both' ? 0.35 : 0));
      this._setMeshVisible(this.mode === 'mesh' || this.mode === 'both');
      this.els.hint.textContent = 'drag to rotate · scroll to zoom';
      if (this.rotating) this._startLoop();
    }
    nv.drawScene();
  }
  setMode(m) { this.mode = m; this.applyMode(); }
  setRotate(on) { this.rotating = on; if (on) this._startLoop(); }

  _startLoop() {
    if (this._looping) return;
    this._looping = true;
    const tick = () => {
      if (!this.rotating || this.mode === 'mpr') { this._looping = false; return; }
      if (this.ready) { this.az = (this.az + 0.35) % 360; this.nv.setRenderAzimuthElevation(this.az, this.el); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

/* ---------------- init ---------------- */
async function main() {
  let manifest;
  try { manifest = await (await fetch(MRI_BASE + 'manifest.json')).json(); }
  catch (e) { $('loading-2d').textContent = 'could not load manifest'; console.error(e); return; }

  new SliceViewer(manifest, {
    canvas: $('slice-canvas'), tabs: $('region-tabs'), seriesRow: $('series-row'),
    slider: $('slice-slider'), play: $('play-btn'),
    count: $('slice-count'), headerReadout: $('slice-readout'),
    ovLabel: $('ov-label'), ovRegion: $('ov-region'),
    loading: $('loading-2d'), hint: $('hint-2d'),
  });

  const v3d = new Volume3D($('nv-canvas'), { loading: $('loading-3d'), hint: $('hint-3d'), caption: $('nv-caption') });
  try { await v3d.init(); }
  catch (e) { $('loading-3d').textContent = '3D needs WebGL2'; console.error(e); }

  $('scene-group').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-scene]'); if (!b) return;
    [...$('scene-group').children].forEach((x) => x.classList.toggle('active', x === b));
    v3d.loadScene(b.dataset.scene);
  });
  // Volume/Both/Slices modes were removed in the lighter restore (raw NIfTI volumes dropped);
  // the 3D view shows the rotatable mesh only.
  $('rotate-chk').addEventListener('change', (ev) => v3d.setRotate(ev.target.checked));
}

main();
