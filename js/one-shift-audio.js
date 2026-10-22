(function (root) {
  'use strict';
  const O = root.OneShift;
  // Synthesized room tone and small mechanical sounds, with no music track.
  // All intermittent sounds are driven by update(), never an independent timer.
  const ROOMS = {
    clock: {air: .18, hum: .018, distant: .05, cutoff: 1250, gap: [10, 19]},
    office: {air: .12, hum: .012, distant: .018, cutoff: 800, gap: [14, 25]},
    floor: {air: .22, hum: .027, distant: .085, cutoff: 2200, gap: [9, 18]},
    staging: {air: .25, hum: .022, distant: .10, cutoff: 2600, gap: [8, 17]},
    storage: {air: .18, hum: .018, distant: .065, cutoff: 1700, gap: [11, 21]},
    shipping: {air: .25, hum: .022, distant: .10, cutoff: 2500, gap: [8, 17]}
  };

  class Audio {
    constructor() {
      this.context = null;
      this.volume = .25;
      this.voices = [];
      this.place = 'clock';
      this.active = false;
      this.nextRoomSound = Infinity;
      this.nextClockTick = Infinity;
      this.seed = 1471;
    }

    random() {
      this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }

    async unlock() {
      try {
        if (!this.context) {
          const Context = root.AudioContext || root.webkitAudioContext;
          if (!Context) return;
          this.context = new Context();
          this.master = this.context.createGain();
          this.master.gain.value = this.volume * .3;
          this.master.connect(this.context.destination);
          this.ambience();
        }
        if (this.context.state === 'suspended') await this.context.resume();
      } catch (_) { /* The next user gesture may unlock browser audio. */ }
    }

    noise(seconds, colored = false) {
      const c = this.context;
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
      const data = buffer.getChannelData(0);
      let previous = 0;
      for (let i = 0; i < data.length; i++) {
        const white = this.random() * 2 - 1;
        previous = (previous + white * .025) / 1.025;
        data[i] = colored ? previous * 3.4 : white;
      }
      return buffer;
    }

    ambience() {
      const c = this.context;
      this.ambientSources = [];
      this.air = c.createGain();
      this.motor = c.createGain();
      this.distant = c.createGain();
      for (const gain of [this.air, this.motor, this.distant]) {
        gain.gain.value = 0;
        gain.connect(this.master);
      }
      // Long, independent buffers keep the ventilation from pulsing in rhythm.
      const air = c.createBufferSource();
      air.buffer = this.noise(13, true);
      air.loop = true;
      this.roomFilter = c.createBiquadFilter();
      this.roomFilter.type = 'lowpass';
      this.roomFilter.frequency.value = ROOMS[this.place].cutoff;
      air.connect(this.roomFilter);
      this.roomFilter.connect(this.air);
      air.start();
      this.ambientSources.push(air);

      const distant = c.createBufferSource();
      distant.buffer = this.noise(17, true);
      distant.loop = true;
      const duct = c.createBiquadFilter();
      duct.type = 'bandpass';
      duct.frequency.value = 285;
      duct.Q.value = .65;
      distant.connect(duct);
      duct.connect(this.distant);
      distant.start();
      this.ambientSources.push(distant);
      for (const frequency of [59.8, 120.15]) {
        const motor = c.createOscillator();
        motor.type = 'sine';
        motor.frequency.value = frequency;
        motor.connect(this.motor);
        motor.start();
        this.ambientSources.push(motor);
      }
      this.effectNoise = this.noise(1.6);
    }

    setPlace(name) {
      const next = Object.hasOwn(ROOMS, name) ? name : 'floor';
      if (this.place === next) return;
      this.place = next;
      // A new room gets a quiet interval, not a burst of overdue events.
      this.nextRoomSound = (this.context?.currentTime || 0) + 5 + this.random() * 6;
      this.nextClockTick = (this.context?.currentTime || 0) + 1;
    }

    update(s, active) {
      if (!this.context || this.context.state !== 'running') return;
      const c = this.context, t = c.currentTime, room = ROOMS[this.place];
      const audible = !!active;
      if (audible && !this.active) {
        this.nextRoomSound = t + 5 + this.random() * 7;
        this.nextClockTick = t + 1;
      }
      if (!audible && this.active) this.stopEffects();
      this.active = audible;
      this.air.gain.setTargetAtTime(audible ? room.air : 0, t, .55);
      this.motor.gain.setTargetAtTime(audible ? room.hum : 0, t, .6);
      this.distant.gain.setTargetAtTime(audible ? room.distant : 0, t, .65);
      this.roomFilter.frequency.setTargetAtTime(room.cutoff, t, .6);
      if (!audible || !this.volume) return;

      if (this.place === 'clock' && t >= this.nextClockTick) {
        this.burst({duration: .022, level: .022, frequency: 1900, q: 1.1, pan: .15});
        this.nextClockTick = t + 1;
      }
      if (t >= this.nextRoomSound) {
        // Building/duct settling, not a forklift or worker carrying unseen stock.
        const pan = this.random() * 1.2 - .6;
        const level = this.place === 'office' ? .018 : .038;
        this.burst({duration: .12, level, frequency: 470, q: 1.8, pan});
        this.burst({delay: .14, duration: .08, level: level * .45, frequency: 810, q: 1.4, pan});
        this.nextRoomSound = t + room.gap[0] + this.random() * (room.gap[1] - room.gap[0]);
      }
    }

    setVolume(value) {
      this.volume = Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0;
      if (this.master) this.master.gain.setTargetAtTime(this.volume * .3, this.context.currentTime, .025);
    }

    // Each event has a short envelope and owns its nodes until onended cleans up.
    burst({delay = 0, duration = .13, level = .15, frequency = 1200, q = .7, pan = 0, tone = false, endFrequency}) {
      const c = this.context;
      if (!c || c.state !== 'running' || !this.volume) return;
      const now = c.currentTime, t = now + delay;
      this.voices = this.voices.filter(voice => voice.end > now);
      if (this.voices.length >= 12) return;
      const source = tone ? c.createOscillator() : c.createBufferSource();
      const gain = c.createGain(), filter = c.createBiquadFilter();
      const nodes = [source, gain, filter];
      if (tone) {
        source.type = 'sine';
        source.frequency.setValueAtTime(frequency, t);
        source.frequency.exponentialRampToValueAtTime(endFrequency || frequency, t + duration);
      } else source.buffer = this.effectNoise;
      filter.type = tone ? 'lowpass' : 'bandpass';
      filter.frequency.value = tone ? 3500 : frequency;
      filter.Q.value = q;
      source.connect(filter);
      filter.connect(gain);
      gain.gain.setValueAtTime(.0001, t);
      gain.gain.linearRampToValueAtTime(level, t + Math.min(.012, duration * .15));
      gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      if (c.createStereoPanner) {
        const panner = c.createStereoPanner();
        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(this.master);
        nodes.push(panner);
      } else gain.connect(this.master);
      const voice = {source, end: t + duration + .02};
      source.onended = () => {
        for (const node of nodes) node.disconnect();
        const i = this.voices.indexOf(voice);
        if (i !== -1) this.voices.splice(i, 1);
      };
      source.start(t);
      source.stop(voice.end);
      this.voices.push(voice);
    }

    clockPunch() {
      this.burst({duration: .075, level: .48, frequency: 1400, q: .8});
      this.burst({delay: .065, duration: .18, level: .23, frequency: 390, q: 2});
      this.burst({delay: .19, duration: .12, level: .11, frequency: 2300, q: .55});
    }

    play(kind) {
      if (kind === 'clock') { this.clockPunch(); return; }
      if (kind === 'scan') {
        this.burst({duration: .09, level: .13, frequency: 1450, endFrequency: 1470, tone: true});
      } else if (kind === 'error') {
        this.burst({duration: .12, level: .14, frequency: 150, endFrequency: 110, tone: true});
      } else if (kind === 'truck' || kind === 'departure') {
        this.burst({duration: 1.2, level: .19, frequency: 160, q: .55, pan: .4});
      } else if (kind === 'dock' || kind === 'door') {
        this.burst({duration: .4, level: .27, frequency: 460, q: .8});
        this.burst({delay: .15, duration: .16, level: .12, frequency: 1900, q: 1.3});
      } else if (kind === 'wrap' || kind === 'paper' || kind === 'fee') {
        this.burst({duration: kind === 'wrap' ? .45 : .23, level: .15, frequency: 2600, q: .45});
      } else if (kind === 'setdown') {
        this.burst({duration: .22, level: .30, frequency: 290, q: .6});
      } else {
        this.burst({duration: .045, level: .11, frequency: 1000, q: .7});
      }
    }

    stopEffects() {
      for (const voice of this.voices) {
        try { voice.source.stop(); } catch (_) { /* It may already have ended. */ }
      }
      this.voices = [];
    }

    suspend() {
      this.active = false;
      this.stopEffects();
      if (this.context) {
        for (const gain of [this.air, this.motor, this.distant]) {
          gain.gain.cancelScheduledValues(this.context.currentTime);
          gain.gain.setValueAtTime(0, this.context.currentTime);
        }
        this.context.suspend().catch(() => {});
      }
    }

    close() {
      this.stopEffects();
      this.context?.close().catch(() => {});
    }
  }
  O.Audio = Audio;
})(window);
