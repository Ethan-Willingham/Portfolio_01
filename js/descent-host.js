// DOM-free host machinery. No canvas, animation loop, network request or room
// allocation happens merely by importing this module.
export const VERSION = '4';
export const FIXED_DT = 1 / 60;
export const PLAYBACK_RATES = Object.freeze([1, 4, 12]);
export const ROUTE = Object.freeze([
  { id: 'soap-film', title: 'Soap film', file: 'soap-film-room.js', assets: 'soap-film' },
  { id: 'negative-temperature', title: 'Superfluid', file: 'negative-temperature-room.js', assets: 'negative-temperature' },
  { id: 'hydrogen-exactly', title: 'Hydrogen', file: 'hydrogen-exactly-room.js', assets: 'hydrogen-exactly' }
]);
export const BOOTSTRAP = { id: 'descent-bootstrap', title: 'Hydrogen interim study', file: 'descent-bootstrap-room.js', assets: 'descent' };
export const ROOMS = [...ROUTE, BOOTSTRAP];
const METHODS = ['resize', 'step', 'render', 'snapshot', 'debugReadback', 'dispose'];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export function validateModule(module, id) {
  const i = module?.roomInfo;
  if (!i || i.apiVersion !== 1 || i.id !== id || !i.title || !i.model ||
      typeof i.scaleMeaning !== 'string' || !Array.isArray(i.sources) ||
      !(i.representativeScaleMeters === null || (Number.isFinite(i.representativeScaleMeters) && i.representativeScaleMeters > 0)) ||
      typeof module.createRoom !== 'function') throw new Error(`${id}: incompatible roomInfo/createRoom contract`);
  return module;
}
export function validateSnapshot(s, id) {
  if (!s || s.apiVersion !== 1 || s.id !== id || typeof s.model !== 'string') throw new Error(`${id}: snapshot must identify its API and actual model`);
  // JSON.stringify alone silently hides NaN. Reject those explicitly.
  const walk = v => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${id}: nonfinite diagnostic`);
    if (typeof v === 'function' || typeof v === 'bigint' || typeof v === 'undefined') throw new Error(`${id}: non-JSON diagnostic`);
    if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(s); JSON.stringify(s);
  return s;
}
export class ModuleRegistry {
  constructor({ importer = url => import(url), baseURL = import.meta.url } = {}) {
    this.importer = importer; this.baseURL = baseURL; this.entries = new Map();
  }
  load(id, retry = false) {
    const spec = ROOMS.find(r => r.id === id);
    if (!spec) return Promise.reject(new Error(`Unknown room: ${id}`));
    const cached = this.entries.get(id);
    if (cached && !retry) return cached.promise;
    const entry = { id, status: 'loading', error: null, info: null };
    const url = new URL(spec.file, this.baseURL);
    url.searchParams.set('descent', VERSION);
    if (retry) url.searchParams.set('retry', Date.now().toString());
    entry.url = url.href;
    entry.assetBaseURL = new URL(`../assets/visualizer/${spec.assets}/`, this.baseURL).href;
    entry.promise = Promise.resolve().then(() => this.importer(url.href)).then(m => {
      validateModule(m, id); entry.status = 'ready'; entry.info = m.roomInfo; return m;
    }).catch(e => { entry.status = 'unavailable'; entry.error = e.message; throw e; });
    this.entries.set(id, entry); return entry.promise;
  }
  async probe() { return Promise.allSettled(ROUTE.map(r => this.load(r.id))); }
  snapshot() { return [...this.entries.values()].map(({ id, status, error, info, url }) => ({ id, status, error, info, url })); }
}

// Resource sizes are allocation estimates, not vendor driver memory. Descent
// records every room buffer/texture, including allocations during initialization.
export function textureBytes(desc) {
  const size = desc.size;
  const [w, h, d] = Array.isArray(size) ? [size[0], size[1] ?? 1, size[2] ?? 1] : [size.width, size.height ?? 1, size.depthOrArrayLayers ?? 1];
  const bpp = { r8unorm: 1, r32float: 4, rg32float: 8, rgba32float: 16, rg16float: 4, rgba16float: 8, rgba8unorm: 4, 'rgba8unorm-srgb': 4, bgra8unorm: 4, r16float: 2, depth24plus: 4, depth32float: 4 }[desc.format];
  if (!bpp) return null;
  let total = 0;
  for (let m = 0; m < (desc.mipLevelCount ?? 1); m++) total += Math.max(1, w >> m) * Math.max(1, h >> m) * (desc.dimension === '3d' ? Math.max(1, d >> m) : d) * bpp * (desc.sampleCount ?? 1);
  return total;
}
export class ResourceLedger {
  constructor() { this.resources = new Map(); this.peakBytes = 0; this.created = 0; this.destroyed = 0; this.closed = false; }
  add(resource, bytes, kind) {
    if (this.closed) { resource.destroy(); throw new Error('Room allocated a resource after disposal'); }
    const destroy = resource.destroy.bind(resource);
    const record = { bytes, kind, destroy };
    this.resources.set(resource, record); this.created++;
    // Keep actual native objects usable in bindings and queue calls.
    resource.destroy = () => {
      if (!this.resources.delete(resource)) return;
      this.destroyed++; destroy();
    };
    this.peakBytes = Math.max(this.peakBytes, this.snapshot().bytes);
    return resource;
  }
  deviceFacade(device) {
    return new Proxy(device, { get: (target, key) => {
      if (key === 'destroy') return () => { throw new Error('A room cannot destroy the host WebGPU device'); };
      if (key === 'createBuffer' || key === 'createTexture' || key === 'createQuerySet') return desc => {
        if (this.closed) throw new Error('Room allocated a resource after disposal');
        return this.add(target[key](desc), key === 'createBuffer' ? desc.size : key === 'createTexture' ? textureBytes(desc) : desc.count*8, key === 'createBuffer' ? 'buffer' : key === 'createTexture' ? 'texture' : 'querySet');
      };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
  }
  snapshot() {
    let bytes = 0, unknown = 0, buffers = 0, textures = 0, querySets = 0;
    for (const r of this.resources.values()) { if (r.bytes === null) unknown++; else bytes += r.bytes; if (r.kind === 'buffer') buffers++; else if (r.kind === 'texture') textures++; else querySets++; }
    return { bytes, unknownSizeAllocations: unknown, buffers, textures, querySets, peakBytes: this.peakBytes, created: this.created, destroyed: this.destroyed };
  }
  dispose() { this.closed = true; for (const r of [...this.resources.keys()]) r.destroy(); }
}

export class RoomManager {
  constructor({ device, registry, width = 1, height = 1, dpr = 1, quality = 'medium', targetFactory } = {}) {
    Object.assign(this, { device, registry, width, height, dpr, quality });
    this.targetFactory = targetFactory ?? (() => device.createTexture({ label: 'Descent linear room target', size: [this.width, this.height], format: 'rgba16float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC }));
    this.active = null; this.sequence = 0; this.pending = Promise.resolve(); this.closed = false; this.retired = []; this.lastError = null;
  }
  async select(id, seed) {
    const ticket = ++this.sequence;
    const run = async () => {
      if (this.closed || ticket !== this.sequence) return false;
      this.release(); this.lastError = null;
      let room, target; const ledger = new ResourceLedger();
      try {
        const module = await this.registry.load(id);
        if (this.closed || ticket !== this.sequence) return false;
        room = await module.createRoom({ device: ledger.deviceFacade(this.device), seed, quality: this.quality, assetBaseURL: this.registry.entries.get(id).assetBaseURL });
        for (const method of METHODS) if (typeof room?.[method] !== 'function') throw new Error(`${id}: missing ${method}()`);
        if (this.closed || ticket !== this.sequence) { room.dispose(); ledger.dispose(); return false; }
        room.resize({ width: this.width, height: this.height, dpr: this.dpr });
        validateSnapshot(room.snapshot(), id);
        target = this.targetFactory();
        this.active = { id, seed, room, info: module.roomInfo, ledger, target, view: target.createView(), ticks: 0, scoreOrigin: 0 };
        return true;
      } catch (e) {
        try { room?.dispose(); } catch (_) { /* release ledger even after a bad room */ }
        ledger.dispose(); target?.destroy(); this.lastError = { id, message: e.message }; return false;
      }
    };
    this.pending = this.pending.catch(() => {}).then(run); return this.pending;
  }
  resize({ width, height, dpr }) {
    Object.assign(this, { width, height, dpr });
    if (!this.active) return;
    this.active.room.resize({ width, height, dpr });
    this.active.target.destroy(); this.active.target = this.targetFactory(); this.active.view = this.active.target.createView();
  }
  step(scoreSeconds) {
    const a = this.active; if (!a) return;
    a.room.step({ dtSeconds: FIXED_DT, elapsedSeconds: (a.ticks + 1) * FIXED_DT, scoreSeconds }); a.ticks++;
  }
  render(encoder, exposure = 1, presentation = {}) {
    if (this.active) this.active.room.render({ encoder, targetView: this.active.view, width: this.width, height: this.height, exposure, ...presentation });
  }
  snapshot() { return this.active ? validateSnapshot(this.active.room.snapshot(), this.active.id) : null; }
  release() {
    const a = this.active; this.active = null;
    if (!a) return;
    try { a.room.dispose(); } catch (e) { this.lastError = { id: a.id, message: `dispose: ${e.message}` }; }
    finally { a.ledger.dispose(); a.target.destroy(); this.retired.push({ id: a.id, ...a.ledger.snapshot() }); this.retired = this.retired.slice(-32); }
  }
  resources() { return { room: this.active?.ledger.snapshot() ?? null, targetBytes: this.active ? this.width * this.height * 8 : 0, liveRooms: this.active ? 1 : 0, retired: this.retired }; }
  dispose() { this.closed = true; ++this.sequence; this.release(); }
}

const ease = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export class RouteClock {
  constructor(saved = {}) {
    this.index = clamp(Math.floor(saved.index || 0), 0, ROUTE.length - 1); this.cycle = Math.max(0, Math.floor(saved.cycle || 0));
    this.age = clamp(saved.age || 0, 0, 220); this.extension = clamp(saved.extension || 0, 0, 40); this.total = Math.max(0, saved.total || 0);
  }
  get phase() {
    if (this.age < 4) return 'arriving';
    if (this.age < 174 + this.extension) return 'watching';
    if (this.age < 178 + this.extension) return 'leaving';
    return 'rest';
  }
  get fade() { return this.phase === 'arriving' ? ease(this.age / 4) : this.phase === 'leaving' ? 1 - ease((this.age - 174 - this.extension) / 4) : this.phase === 'rest' ? 0 : 1; }
  get position() { return this.index * 180 + Math.min(this.age, 179); }
  tick(dt, snapshot) {
    // A module may explicitly report a measured event still in progress. No
    // inferred climax is manufactured from brightness or a generic score.
    if (this.age >= 174 + this.extension - dt && snapshot?.routeEvent?.pending === true && snapshot.routeEvent.complete !== true) this.extension = Math.min(40, this.extension + dt);
    this.age += dt; this.total += dt;
    if (this.age + 1e-8 < 180 + this.extension) return false;
    this.age = 0; this.extension = 0; this.index++;
    if (this.index === ROUTE.length) { this.index = 0; this.cycle++; }
    return true;
  }
  seek(position) { const p = clamp(position, 0, ROUTE.length * 180 - 1); this.index = Math.floor(p / 180); this.age = p % 180; this.extension = 0; }
  snapshot() { return { index: this.index, cycle: this.cycle, age: this.age, extension: this.extension, total: this.total, phase: this.phase }; }
}
export class AmbientClock {
  constructor() { this.last = null; this.accumulator = 0; this.droppedSeconds = 0; this.maxSteps = 3; }
  reset() { this.last = null; this.accumulator = 0; }
  frame(now, enabled, step, { rate = 1, budgetMs = Infinity } = {}) {
    if (!enabled) { this.reset(); return 0; }
    if (this.last === null) { this.last = now; return 0; }
    const delta = Math.max(0, (now - this.last) / 1000); this.last = now;
    rate = PLAYBACK_RATES.includes(rate) ? rate : 1;
    this.accumulator += Math.min(delta, .1) * rate; this.droppedSeconds += Math.max(0, delta - .1) * rate;
    const limit = this.maxSteps * rate, started = performance.now();
    let count = 0;
    // Fast playback requests more of the same fixed steps, then yields for
    // input and presentation. Slow devices never accrue an unbounded backlog.
    while (this.accumulator >= FIXED_DT && count < limit) {
      if (count && performance.now() - started >= budgetMs) break;
      this.accumulator -= FIXED_DT; if (step() === false) { this.reset(); break; } count++;
    }
    if (this.accumulator > FIXED_DT * limit) { this.droppedSeconds += this.accumulator - FIXED_DT; this.accumulator = FIXED_DT; }
    return count;
  }
}
export class CostSamples {
  constructor() { this.samples = {}; }
  add(name, value) { const a = this.samples[name] ??= []; a.push(value); if (a.length > 360) a.shift(); }
  snapshot() {
    return Object.fromEntries(Object.entries(this.samples).map(([name, values]) => { const s = [...values].sort((a, b) => a - b); return [name, { samples: s.length, medianMs: s[Math.floor(s.length * .5)], p95Ms: s[Math.min(s.length - 1, Math.floor(s.length * .95))], meaning: 'CPU wall time; GPU execution is asynchronous' }]; }));
  }
}
export function scaleLabel(info, s = {}) {
  const specific = s.scale ?? s.physicalScale ?? (Object.hasOwn(s,'representativeScaleMeters') ? {meters:s.representativeScaleMeters,meaning:s.scaleMeaning,source:s.sources?.[0] ?? info.sources[0] ?? null} : null);
  // A mode override must include its meaning and a source. Unknown parameter
  // sets cannot inherit a lattice calibration from another beta or group.
  const scale = specific ?? { meters: info.representativeScaleMeters, meaning: info.scaleMeaning, source: info.sources[0] ?? null };
  const meters = scale.meters ?? scale.representativeScaleMeters;
  if (!Number.isFinite(meters) || meters <= 0 || !scale.source) return `Model units. ${scale.meaning ?? info.scaleMeaning}`;
  const units = meters < 1e-12 ? [1e-15, 'fm'] : meters < 1e-6 ? [1e-9, 'nm'] : meters < 1e-3 ? [1e-6, 'micrometers'] : [1, 'm'];
  return `${(meters / units[0]).toPrecision(3)} ${units[1]}. ${scale.meaning ?? info.scaleMeaning}`;
}
export function routeCompleteness(registry, snapshots = {}) {
  const missing = ROUTE.filter(r => registry.entries.get(r.id)?.status !== 'ready').map(r => `js/${r.file}`);
  return { modulesReady: ROUTE.length - missing.length, modulesTotal: ROUTE.length, missing, complete: missing.length === 0 && ROUTE.every(r => snapshots[r.id]) };
}
export async function deriveRoomSeed(seed, id, cycle) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`descent:v1:${seed}:${id}:${cycle}`));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
