/* Local cart Foley. Audio starts on a play gesture; motion only reads physics.
 * A shared noise buffer, bounded voices and one compressor keep pileups small.
 */
(function (root) {
  'use strict';
  const MAX_VOICES = 32;
  const nearbyEvents = new Set(['break', 'product-land', 'rack-hit', 'wheel-rattle', 'squash', 'shelf-down', 'bump', 'wall-hit', 'mess', 'shopper-impact']);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const surfaces = {
    dirt: { frequency: 1500, volume: .13, rattle: 16 },
    grass: { frequency: 550, volume: .09, rattle: 28 },
    asphalt: { frequency: 430, volume: .075, rattle: 38 },
    tile: { frequency: 850, volume: .08, rattle: 32 },
    ice: { frequency: 300, volume: .025, rattle: 50 }
  };

  class Sound {
    constructor({ enabled = true, onUnavailable = () => {} } = {}) {
      this.enabled = enabled; this.onUnavailable = onUnavailable;
      this.context = null; this.voices = new Set(); this.cooldowns = new Map();
      this.travel = 0; this.footPhase = null; this.seed = 0x4c617274;
      this.active = false; this.epoch = 0; this.sleepTimer = null; this.suspending = null;
    }
    random() {
      let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this.seed = x >>> 0; return this.seed / 4294967296;
    }
    initialize(ac) {
      this.context = ac;
      this.master = ac.createGain(); this.master.gain.value = this.enabled ? .65 : 0;
      this.compressor = ac.createDynamicsCompressor();
      this.compressor.threshold.value = -18; this.compressor.knee.value = 12;
      this.compressor.ratio.value = 5; this.compressor.attack.value = .003; this.compressor.release.value = .12;
      this.master.connect(this.compressor).connect(ac.destination);
      this.buffer = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const data = this.buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = this.random() * 2 - 1;
      this.roll = this.loop('bandpass', 850, .65);
      this.skid = this.loop('bandpass', 1900, 1.3);
      this.shutter = this.loop('bandpass', 130, 2);
    }
    async prepare() {
      if (!this.enabled) return false;
      this.cancelSleep();
      const epoch = this.epoch;
      try {
        if (this.context?.state === 'closed') this.dispose();
        if (!this.context) {
          const Audio = root.AudioContext || root.webkitAudioContext;
          if (!Audio) throw new Error('Audio unavailable');
          this.initialize(new Audio());
        }
        if (this.context.state !== 'running' || this.suspending) await this.context.resume();
        if (epoch !== this.epoch || !this.enabled) { this.sleepWhenIdle(); return false; }
        return !!this.ready;
      } catch {
        this.dispose(); this.enabled = false; this.onUnavailable(); return false;
      }
    }
    cancelSleep() {
      if (this.sleepTimer !== null) root.clearTimeout(this.sleepTimer);
      this.sleepTimer = null;
    }
    sleepWhenIdle() {
      const ac = this.context;
      if (this.active || this.voices.size || !ac || ac.state !== 'running' || typeof ac.startRendering === 'function') return;
      this.cancelSleep();
      this.sleepTimer = root.setTimeout(() => {
        this.sleepTimer = null;
        if (this.active || this.voices.size || this.context !== ac || ac.state !== 'running') return;
        const pending = ac.suspend().catch(() => {}).finally(() => { if (this.suspending === pending) this.suspending = null; });
        this.suspending = pending;
      }, 80);
    }
    dispose() {
      this.cancelSleep(); this.active = false;
      const ac = this.context; this.context = null;
      for (const voice of [...this.voices]) this.release(voice);
      for (const loop of [this.roll, this.skid, this.shutter]) if (loop) {
        try { loop.source.stop(); } catch {}
        loop.source.disconnect(); loop.filter.disconnect(); loop.gain.disconnect();
      }
      this.master?.disconnect(); this.compressor?.disconnect();
      this.roll = this.skid = this.shutter = this.buffer = this.master = this.compressor = null;
      if (ac && ac.state !== 'closed' && typeof ac.close === 'function') ac.close().catch(() => {});
      this.cooldowns.clear(); this.travel = 0; this.footPhase = null;
    }
    get ready() {
      return this.enabled && this.context && (this.context.state === 'running' || typeof this.context.startRendering === 'function');
    }
    loop(type, frequency, q) {
      const ac = this.context, source = ac.createBufferSource(), filter = ac.createBiquadFilter(), gain = ac.createGain();
      source.buffer = this.buffer; source.loop = true;
      filter.type = type; filter.frequency.value = frequency; filter.Q.value = q; gain.gain.value = 0;
      source.connect(filter).connect(gain).connect(this.master); source.start();
      return { source, filter, gain };
    }
    setEnabled(enabled) {
      this.enabled = !!enabled;
      if (!this.enabled) this.stop();
      if (this.master && this.context) {
        const now = this.context.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(this.enabled ? .65 : 0, now, .01);
      }
    }
    stop() {
      this.active = false; this.epoch++; this.cancelSleep();
      if (!this.context) return;
      const now = this.context.currentTime, running = this.context.state === 'running';
      for (const loop of [this.roll, this.skid, this.shutter]) if (loop) {
        loop.gain.gain.cancelScheduledValues(now);
        loop.gain.gain.setValueAtTime(running ? loop.gain.gain.value : 0, now);
        if (running) loop.gain.gain.linearRampToValueAtTime(0, now + .025);
      }
      for (const voice of [...this.voices]) {
        if (!running) { this.release(voice); continue; }
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
        voice.gain.gain.linearRampToValueAtTime(0, now + .02);
        voice.source.stop(now + .025);
      }
      this.cooldowns.clear(); this.travel = 0; this.footPhase = null;
      this.sleepWhenIdle();
    }
    release(voice) {
      this.voices.delete(voice);
      voice.source.onended = null;
      try { voice.source.stop(); } catch {}
      for (const node of voice.nodes) node.disconnect();
      this.sleepWhenIdle();
    }
    voice(source, { duration, volume, delay = 0, pan = 0 }, filter) {
      const ac = this.context, start = ac.currentTime + delay;
      this.cancelSleep();
      if (this.voices.size >= MAX_VOICES) this.release(this.voices.values().next().value);
      const gain = ac.createGain(), panner = ac.createStereoPanner ? ac.createStereoPanner() : null;
      const nodes = [source]; if (filter) { source.connect(filter); nodes.push(filter); }
      (filter || source).connect(gain); nodes.push(gain);
      if (panner) { panner.pan.value = clamp(pan, -1, 1); gain.connect(panner).connect(this.master); nodes.push(panner); }
      else gain.connect(this.master);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume, start + .004);
      gain.gain.exponentialRampToValueAtTime(.00001, start + duration);
      const voice = { source, nodes, gain }; this.voices.add(voice);
      source.onended = () => this.release(voice);
      source.start(start); source.stop(start + duration + .015);
    }
    tone(frequency, duration, volume, { end, type = 'sine', delay = 0, pan = 0 } = {}) {
      if (!this.ready) return;
      const ac = this.context, source = ac.createOscillator(), start = ac.currentTime + delay;
      source.type = type; source.frequency.setValueAtTime(frequency, start);
      if (end) source.frequency.exponentialRampToValueAtTime(end, start + duration);
      this.voice(source, { duration, volume, delay, pan });
    }
    noise(frequency, duration, volume, { end, type = 'bandpass', q = .7, delay = 0, pan = 0 } = {}) {
      if (!this.ready) return;
      const ac = this.context, source = ac.createBufferSource(), filter = ac.createBiquadFilter(), start = ac.currentTime + delay;
      source.buffer = this.buffer; source.playbackRate.value = .85 + this.random() * .3;
      filter.type = type; filter.Q.value = q; filter.frequency.setValueAtTime(frequency, start);
      if (end) filter.frequency.exponentialRampToValueAtTime(end, start + duration);
      this.voice(source, { duration, volume, delay, pan }, filter);
    }
    allow(key, seconds) {
      const now = this.context.currentTime;
      if (now < (this.cooldowns.get(key) || 0)) return false;
      this.cooldowns.set(key, now + seconds); return true;
    }
    metal(power = 1, heavy = false, pan = 0) {
      this.noise(heavy ? 650 : 1400, .09, .12 * power, { pan });
      [heavy ? 72 : 145, 327, 571, 943].forEach((f, i) =>
        this.tone(f * (.97 + this.random() * .06), (heavy ? .42 : .25) / (1 + i * .4), .075 * power / (1 + i), { pan }));
    }
    splash(power = 1, pan = 0) {
      this.noise(1800, .45, .24 * power, { end: 280, type: 'lowpass', pan });
      this.noise(3200, .2, .09 * power, { end: 900, delay: .12, pan });
    }
    event(e, pan = 0, distance = 0) {
      if (!this.ready) return;
      const nearby = nearbyEvents.has(e.type);
      if (nearby && distance > 260) return;
      const power = clamp((e.impact ?? 65) / 65, .3, 1) * (nearby ? 1 / (1 + (distance / 140) ** 2) : 1);
      const delay = { break: .035, 'rack-hit': .1, 'wheel-rattle': .08, 'product-land': .06, bump: .12, 'wall-hit': .12 }[e.type] || .04;
      if (!this.allow(e.type, delay)) return;
      if (e.type === 'bump' || e.type === 'rack-hit' || e.type === 'shelf-down') this.metal(power, e.type === 'shelf-down', pan);
      if (e.type === 'wall-hit') this.metal(power * (e.part === 'wheel' ? .45 : .75), false, pan);
      if (e.type === 'mess' && e.kind !== 'shelf' && e.kind !== 'table') {
        this.noise(e.kind === 'cone' ? 1400 : 550, .13, .16 * power, { type: 'lowpass', pan });
        this.tone(e.kind === 'cone' ? 260 : 90, .1, .045 * power, { end: e.kind === 'cone' ? 150 : 50, type: 'triangle', pan });
      }
      if (e.type === 'break') {
        const ceramic = e.material === 'ceramic';
        this.noise(ceramic ? 1200 : 3500, ceramic ? .24 : .32, .2 * power, { type: ceramic ? 'bandpass' : 'highpass', pan });
        (ceramic ? [430, 780, 1430] : [1870, 2790, 3910]).forEach((f, i) =>
          this.tone(f * (.94 + this.random() * .12), .16 + i * .035, .035 * power / (i + 1), { delay: i * .017, pan }));
        if (e.kind === 'vase' || e.kind === 'wine') this.splash(.35 * power, pan);
      }
      if (e.type === 'squash') { this.noise(1000, .22, .13 * power, { end: 180, pan }); this.tone(95, .15, .04 * power, { end: 35, pan }); }
      if (e.type === 'wheel-rattle') this.metal((e.kind === 'can' ? .3 : .15) * power, false, pan);
      if (e.type === 'product-land') {
        if (e.material === 'metal') this.metal(power * .45, false, pan);
        else {
          this.noise(e.material === 'glass' ? 1800 : 550, .1, .14 * power, { pan });
          this.tone(e.material === 'glass' ? 1700 : 120, .1, (e.material === 'glass' ? .035 : .065) * power, { end: e.material === 'glass' ? 1600 : 75, pan });
        }
      }
      if (e.type === 'land') { this.noise(300, .18, .18 * power, { type: 'lowpass', pan }); if (e.impact > 20) this.metal(power * .7, true, pan); }
      if (e.type === 'fall-impact') { if (e.kind === 'lake') this.splash(1, pan); else this.metal(1, true, pan); }
      if (e.type === 'fall') this.noise(1900, .65, .08, { end: 350, pan });
      if (e.type === 'shopper-launch') { this.tone(180, .13, .055, { end: 480, type: 'triangle', pan }); this.noise(1100, .12, .07, { end: 2800, pan }); }
      if (e.type === 'shopper-impact') { if (e.kind === 'lake') this.splash(.55 * power, pan); else { this.noise(240, .16, .16 * power, { type: 'lowpass', pan }); this.tone(95, .13, .055 * power, { end: 45, type: 'triangle', pan }); } }
      if (e.type === 'boost') { this.noise(450, .3, .09, { end: 2500, pan }); this.tone(90, .3, .035, { end: 380, type: 'triangle', pan }); }
      if (e.type === 'jump') this.noise(1400, .16, .1, { end: 500, pan });
      if (e.type === 'circuit') { this.metal(.15); [220, 440, 880].forEach((f, i) => this.tone(f, .15, .045, { delay: i * .09 })); }
      if (e.type === 'gate') { this.tone(1047, .1, .045); this.tone(1568, .16, .025, { delay: .055 }); }
      if (e.type === 'room' || e.type === 'save-edge' || e.type === 'respawn') this.tone(e.type === 'room' ? 784 : 523, .12, .032);
      if (e.type === 'won') [523, 659, 784, 1047].forEach((f, i) => this.tone(f, .35, .07, { delay: i * .11 }));
      if (e.type === 'toggle') this.metal(.18);
    }
    update(world, input = {}, dt = 0) {
      if (!this.ready) return;
      this.active = true; this.cancelSleep();
      const ac = this.context, now = ac.currentTime, b = world.body;
      const loaded = world.wheels.filter(w => w.load > .02 && w.surface?.kind);
      const ground = !world.fall && !world.ground.airborne && loaded.length > 0;
      const counts = new Map();
      for (const w of loaded) counts.set(w.surface.kind, (counts.get(w.surface.kind) || 0) + 1);
      const kind = [...counts].sort((a, z) => z[1] - a[1])[0]?.[0] || 'dirt';
      // Blend the actual loaded tires, including opposite rolling directions
      // during a turn. A sideways basket with aligned forks is not a skid.
      const surface = { frequency: 0, volume: 0, rattle: 0 };
      let speed = 0, lateral = 0;
      for (const w of loaded) {
        const material = surfaces[w.surface.kind] || surfaces.tile;
        for (const key of ['frequency', 'volume', 'rattle']) surface[key] += material[key] / loaded.length;
        speed += Math.abs(w.speed ?? Math.hypot(b.vx, b.vy)) / loaded.length;
        lateral += Math.abs(-Math.sin(w.a) * b.vx + Math.cos(w.a) * b.vy) / loaded.length;
      }
      const motion = ground ? clamp((speed - 1) / 90, 0, 1) : 0;
      this.roll.filter.frequency.setTargetAtTime(surface.frequency || surfaces.dirt.frequency, now, .09);
      this.roll.source.playbackRate.setTargetAtTime(.7 + Math.min(speed, 180) / 100, now, .1);
      this.roll.gain.gain.setTargetAtTime(motion * surface.volume * loaded.length / 4, now, .035);
      const skid = ground ? clamp((input.brake || 0) * Math.max(0, speed - 10) / 65 + Math.max(0, lateral - 15) / 100, 0, 1) : 0;
      this.skid.filter.frequency.setTargetAtTime(kind === 'ice' ? 2800 : kind === 'dirt' ? 1100 : 1900, now, .04);
      this.skid.gain.gain.setTargetAtTime(skid * (kind === 'ice' ? .025 : .09), now, .025);
      this.shutter.gain.gain.setTargetAtTime(world.circuit?.powered && world.circuit.lift < 1 ? .06 : 0, now, .04);
      const swivel = world.wheels.reduce((n, w) => n + (!w.fixed && w.load > .02 ? Math.abs(w.omega - b.omega) : 0), 0) / 4;
      if (ground && swivel > .45 && this.voices.size < 24 && this.allow('caster', .18)) {
        const frequency = 950 + this.random() * 350;
        this.tone(frequency, .09, Math.min(.035, swivel * .008), { end: frequency * .65, type: 'triangle' });
        this.noise(2400, .07, .02, { q: 2 });
      }
      this.travel += ground ? speed * Math.min(dt, .1) : 0;
      if (this.travel > surface.rattle && this.voices.size < 24 && this.allow('frame', .16)) {
        this.travel = 0; this.metal(motion * (kind === 'dirt' ? .18 : .1));
      }
      const footPhase = Math.floor((world.gait.phase || 0) / Math.PI);
      if (this.footPhase !== null && footPhase !== this.footPhase && world.shopper?.feet > .1 && world.gait.speed > 5 && this.voices.size < 24 && this.allow('foot', .16)) {
        const pan = footPhase ? -.15 : .15;
        this.noise(kind === 'tile' ? 550 : 1000, .07, .09, { type: 'lowpass', pan });
        this.tone(kind === 'tile' ? 180 : 100, .08, .045, { end: 65, type: 'triangle', pan });
      }
      this.footPhase = footPhase;
    }
  }
  const api = { create: options => new Sound(options), MAX_VOICES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CartAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
