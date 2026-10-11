/* Procedural impact audio. Water motion and impact detection belong to the native solver. */
(function () {
  'use strict';
  var TUNING = Object.freeze({
    voices: 24, batch: 64, log: 256, energyReference: 0.00001,
    gain: 0.022, attack: 0.002, decayLow: 0.075, decayHigh: 0.22,
    pitchLow: 190, pitchHigh: 740, chirp: 0.09,
    modes: [1, 2.73, 5.11], weights: [0.76, 0.18, 0.06],
    peakLimit: 0.06, staleMs: 100
  });
  var PREFERENCE = 'wss-impact-sound';
  function ventFrequency(soundSpeed,pipeLength,throatArea){return soundSpeed/(4*(pipeLength+.6*Math.sqrt(throatArea/Math.PI)));}

  // This function is serialized once into the worklet. Its fixed arrays are also
  // used by the author test, so offline checks exercise the actual synthesis.
  function installProcessor(tuning) {
    class ImpactProcessor extends AudioWorkletProcessor {
      constructor() {
        super();
        this.enabled = false;
        this.age = new Float64Array(tuning.voices);
        this.duration = new Float64Array(tuning.voices);
        this.energy = new Float64Array(tuning.voices);
        this.gain = new Float64Array(tuning.voices);
        this.pitch = new Float64Array(tuning.voices);
        this.pan = new Float64Array(tuning.voices);
        this.phase = new Float64Array(tuning.voices * 3);
        this.maxVoices = 0;
        this.port.onmessage = (message) => {
          var data = message.data;
          if (data.kind === 'active') {
            this.enabled = data.value;
            this.duration.fill(0);
            return;
          }
          if (data.kind !== 'impacts') return;
          var accepted = 0, dropped = 0, stolen = 0;
          var outcomes = [];
          for (var j = 0; j < data.events.length; j++) {
            var event = data.events[j];
            if (!this.enabled) { dropped++; outcomes.push(false); continue; }
            var chosen = -1, weakest = Infinity;
            for (var i = 0; i < tuning.voices; i++) {
              if (this.age[i] >= this.duration[i]) { chosen = i; break; }
              var remainder = Math.exp(-12 * this.age[i] / this.duration[i]);
              var remainingEnergy = this.energy[i] * remainder;
              if (remainingEnergy < weakest) { weakest = remainingEnergy; chosen = i; }
            }
            var occupied = this.age[chosen] < this.duration[chosen];
            if (occupied && event.energy <= weakest) { dropped++; outcomes.push(false); continue; }
            if (occupied) stolen++;
            var strength = Math.sqrt(event.energy / (event.energy + tuning.energyReference));
            var hash = ((Math.round(event.x * 11) ^ Math.round(event.y * 19) ^ event.tick) >>> 0);
            hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
            var variation = (hash & 65535) / 65535;
            this.age[chosen] = 0;
            this.duration[chosen] = tuning.decayLow + strength * (tuning.decayHigh - tuning.decayLow);
            this.energy[chosen] = event.energy;
            this.gain[chosen] = tuning.gain * strength;
            this.pitch[chosen] = tuning.pitchLow + variation * (tuning.pitchHigh - tuning.pitchLow);
            this.pan[chosen] = Math.max(-0.85, Math.min(0.85, (event.x / 720 - 0.5) * 1.7));
            this.phase.fill(0, chosen * 3, chosen * 3 + 3);
            accepted++; outcomes.push(true);
          }
          var active = 0;
          for (var k = 0; k < tuning.voices; k++) if (this.age[k] < this.duration[k]) active++;
          this.maxVoices = Math.max(this.maxVoices, active);
          this.port.postMessage({ kind: 'ack', serial: data.serial, accepted: accepted,
            dropped: dropped, stolen: stolen, activeVoices: active,
            maxVoices: this.maxVoices, audioTime: currentTime, outcomes: outcomes });
        };
      }
      process(inputs, outputs) {
        var output = outputs[0], left = output[0], right = output[1] || left;
        left.fill(0); if (right !== left) right.fill(0);
        if (!this.enabled) return true;
        var step = 1 / sampleRate, turn = Math.PI * 2;
        for (var v = 0; v < tuning.voices; v++) {
          if (this.age[v] >= this.duration[v]) continue;
          var angle = (this.pan[v] + 1) * Math.PI / 4;
          var panLeft = Math.cos(angle), panRight = Math.sin(angle);
          for (var s = 0; s < left.length; s++) {
            var age = this.age[v];
            if (age >= this.duration[v]) break;
            var envelope = Math.min(1, age / tuning.attack) * Math.exp(-6 * age / this.duration[v]);
            var frequency = this.pitch[v] * (1 + tuning.chirp * Math.exp(-age * 60));
            var value = 0;
            for (var m = 0; m < 3; m++) {
              var index = v * 3 + m;
              value += Math.sin(this.phase[index]) * tuning.weights[m];
              var phase = this.phase[index] + turn * frequency * tuning.modes[m] * step;
              this.phase[index] = phase > turn ? phase - turn : phase;
            }
            value *= envelope * this.gain[v];
            left[s] += value * panLeft;
            if (right !== left) right[s] += value * panRight;
            this.age[v] += step;
          }
        }
        // A deliberately quiet, memoryless ceiling also bounds coincident impacts.
        for (var n = 0; n < left.length; n++) {
          left[n] = tuning.peakLimit * Math.tanh(left[n] / tuning.peakLimit);
          if (right !== left) right[n] = tuning.peakLimit * Math.tanh(right[n] / tuning.peakLimit);
        }
        return true;
      }
    }
    registerProcessor('wss-water-impacts', ImpactProcessor);
  }

  function create() {
    var context = null, node = null, master = null, moduleUrl = null, preparing = null;
    var enabled = false, active = true, retired = false, freshBatch = true, enableEpoch = 0;
    var lastFrame = -1, serial = 0, pending = null, log = [], preference = false, lastAckTime = -Infinity, lastError = null;
    var hissBuffer=null,hissVoices=[],thermalLog=[],thermalCount=0;
    var ventVoice=null,ventLog=[],ventCount=0;
    var counters = { accepted: 0, dropped: 0, stolen: 0, stale: 0, duplicates: 0,
      suppressed: 0, maxVoices: 0, activeVoices: 0, lastHandleMs: 0, maxHandleMs: 0 };
    try { preference = localStorage.getItem(PREFERENCE) === '1'; } catch (_) {}
    function remember(value) {
      preference = value;
      try { localStorage.setItem(PREFERENCE, value ? '1' : '0'); } catch (_) {}
    }
    function audible() {
      return enabled && active && !retired && !document.hidden && context && context.state === 'running';
    }
    function silence() {
      freshBatch = true; lastFrame = -1; pending = null; counters.activeVoices = 0;
      if (master) { master.gain.cancelScheduledValues(context.currentTime); master.gain.setValueAtTime(0, context.currentTime); }
      if (node) node.port.postMessage({ kind: 'active', value: false });
      if(ventVoice){ventVoice.gain.gain.cancelScheduledValues(context.currentTime);ventVoice.gain.gain.setValueAtTime(0,context.currentTime);}
    }
    function publishActive() {
      if (!node) return;
      var value = !!audible();
      node.port.postMessage({ kind: 'active', value: value });
      master.gain.setValueAtTime(value ? 1 : 0, context.currentTime);
    }
    function ack(message) {
      var data = message.data;
      if (data.kind !== 'ack' || !pending || data.serial !== pending.serial) return;
      counters.accepted += data.accepted; counters.dropped += data.dropped; counters.stolen += data.stolen;
      counters.activeVoices = data.activeVoices; counters.maxVoices = Math.max(counters.maxVoices, data.maxVoices);
      lastAckTime = data.audioTime;
      for (var i = 0; i < pending.entries.length; i++) {
        pending.entries[i].voiced = data.outcomes[i];
        pending.entries[i].audioTime = data.audioTime;
      }
      pending = null;
    }
    async function enable() {
      if (retired) throw new Error('Sound scene has retired.');
      if (navigator.userActivation && !navigator.userActivation.isActive) {
        throw new Error('Use the Sound button to enable audio.');
      }
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('Web Audio is unavailable.');
      var epoch = ++enableEpoch;
      // Creation and resume happen synchronously inside the caller's gesture.
      if (!context) context = new AudioContextClass({ latencyHint: 'interactive' });
      var resumed = context.resume();
      if (!preparing && !node) {
        preparing = (async function () {
          if (!context.audioWorklet) throw new Error('Impact audio needs AudioWorklet.');
          var source = '(' + installProcessor.toString() + ')(' + JSON.stringify(TUNING) + ');';
          moduleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          try { await context.audioWorklet.addModule(moduleUrl); }
          finally { URL.revokeObjectURL(moduleUrl); moduleUrl = null; }
          if (retired) return;
          node = new AudioWorkletNode(context, 'wss-water-impacts', { numberOfInputs: 0,
            numberOfOutputs: 1, outputChannelCount: [2] });
          master = context.createGain(); master.gain.value = 0;
          node.connect(master); master.connect(context.destination); node.port.onmessage = ack;
        })().finally(function () { preparing = null; });
      }
      try { await Promise.all([resumed, preparing || Promise.resolve()]); }
      catch (error) { lastError = error.message; throw error; }
      if (retired || epoch !== enableEpoch) return;
      if (context.state !== 'running') throw new Error('Audio is suspended. Use Sound again.');
      enabled = true; lastError = null; remember(true); freshBatch = true; publishActive();
    }
    function mute() {
      enableEpoch++; enabled = false; remember(false); silence();
      if (context && context.state === 'running') context.suspend().catch(function () {});
    }
    function setActive(value) {
      var next = !!value;
      if (next === active) return;
      active = next; silence();
      if (active) publishActive();
    }
    function visibility() {
      silence();
      if (!document.hidden) publishActive();
    }
    function consume(events) {
      var started = performance.now();
      var rows = Array.isArray(events) ? events : [];
      if (!audible() || !node) { counters.suppressed += rows.length; return; }
      if (!rows.length) return;
      var frame = -1;
      for (var k = 0; k < rows.length; k++) if (Number.isFinite(rows[k].frameId)) frame = Math.max(frame, rows[k].frameId);
      if (freshBatch) { freshBatch = false; lastFrame = frame; counters.stale += rows.length; return; }
      if (frame <= lastFrame) { counters.duplicates += rows.length; return; }
      var previousFrame = lastFrame;
      lastFrame = frame;
      if (pending) { counters.dropped += rows.length; return; }
      var selected = [];
      for (var i = 0; i < Math.min(rows.length, 256); i++) {
        var row = rows[i];
        if (row.kind !== 'impact' || !Number.isFinite(row.energy) || row.energy <= 0 ||
            !Number.isFinite(row.x) || !Number.isFinite(row.y) || !Number.isFinite(row.tick) ||
            !Number.isFinite(row.frameId) || !Number.isFinite(row.simulationTime)) { counters.dropped++; continue; }
        if (row.frameId <= previousFrame) { counters.duplicates++; continue; }
        if (row.frameId < frame - 1 || (Number.isFinite(row.ageMs) && row.ageMs > TUNING.staleMs)) { counters.stale++; continue; }
        selected.push(row);
      }
      selected.sort(function (a, b) { return b.energy - a.energy; });
      counters.dropped += Math.max(0, rows.length - 256) + Math.max(0, selected.length - TUNING.batch);
      selected.length = Math.min(selected.length, TUNING.batch);
      var entries = selected.map(function (row) {
        return { kind: 'impact', x: row.x, y: row.y, energy: row.energy, tick: row.tick,
          frameId: row.frameId, simulationTime: row.simulationTime, receivedMs: started,
          audioTime: null, voiced: null };
      });
      if (entries.length) {
        log.push.apply(log, entries); if (log.length > TUNING.log) log.splice(0, log.length - TUNING.log);
        pending = { serial: ++serial, entries: entries };
        node.port.postMessage({ kind: 'impacts', serial: serial, events: entries });
      }
      counters.lastHandleMs = performance.now() - started;
      counters.maxHandleMs = Math.max(counters.maxHandleMs, counters.lastHandleMs);
    }
    function stats() {
      if (context && context.currentTime - lastAckTime >= TUNING.decayHigh) counters.activeVoices = 0;
      return Object.assign({}, counters, { enabled: enabled, preference: preference, active: active,
        audible: !!audible(), contextState: context ? context.state : 'absent',
        voiceCapacity: TUNING.voices, queue: pending ? pending.entries.length : 0,
        queueCapacity: TUNING.batch, eventLog: log.slice(), thermalEvents:thermalLog.slice(), thermalVoices:hissVoices.length, thermalCount:thermalCount,
        ventEvents:ventLog.slice(),ventVoices:ventVoice?1:0,ventCount:ventCount,error: lastError });
    }
    function vent(event){
      if(!audible() || !event || !(event.massFlowKgPerSecond>0) || !(event.soundSpeedMPerSecond>0) ||
        !Number.isFinite(event.massFlowKgPerSecond+event.soundSpeedMPerSecond) || performance.now()-event.receivedAt>TUNING.staleMs)return false;
      var frequency=ventFrequency(event.soundSpeedMPerSecond,event.whistleLengthM,event.throatAreaM2);
      if(!(frequency>0 && frequency<context.sampleRate*.45))return false;
      if(!ventVoice){var oscillator=context.createOscillator(),gain=context.createGain(),pan=context.createStereoPanner();
        oscillator.type='sine';gain.gain.value=0;oscillator.connect(gain);gain.connect(pan);pan.connect(master);oscillator.start();ventVoice={oscillator:oscillator,gain:gain,pan:pan};}
      var now=context.currentTime,power=.5*event.massFlowKgPerSecond*event.jetSpeedMPerSecond*event.jetSpeedMPerSecond;
      var amplitude=.022*Math.sqrt(power/(power+1));ventVoice.pan.pan.setValueAtTime(Math.max(-.8,Math.min(.8,(event.x/720-.5)*1.6)),now);
      ventVoice.oscillator.frequency.setTargetAtTime(frequency,now,.015);ventVoice.gain.gain.cancelScheduledValues(now);
      ventVoice.gain.gain.setTargetAtTime(amplitude,now,.008);ventVoice.gain.gain.setTargetAtTime(0,now+.035,.045);
      ventCount++;ventLog.push({kind:'vent',frameId:event.frameId,simulationTime:event.simulationTime,audioTime:now,
        massFlowKgPerSecond:event.massFlowKgPerSecond,kineticPowerWatts:power,frequencyHz:frequency,gain:amplitude});if(ventLog.length>64)ventLog.shift();return true;
    }
    function hiss(heatJ,x,clock){
      if(!audible() || !(heatJ>0) || !Number.isFinite(heatJ))return false;
      if(!hissBuffer){hissBuffer=context.createBuffer(1,Math.ceil(context.sampleRate*.45),context.sampleRate);var samples=hissBuffer.getChannelData(0),seed=913;
        for(var i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=(seed/4294967296*2-1);}}
      if(hissVoices.length>=4){hissVoices.shift().stop();}
      var source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),pan=context.createStereoPanner(),now=context.currentTime;
      source.buffer=hissBuffer;filter.type='bandpass';filter.frequency.value=2400;filter.Q.value=.6;
      pan.pan.value=Math.max(-.8,Math.min(.8,(x/720-.5)*1.6));
      var amplitude=.055*Math.sqrt(heatJ/(heatJ+2000));gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(amplitude,now+.015);gain.gain.exponentialRampToValueAtTime(.0001,now+.42);
      source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(master);hissVoices.push(source);
      source.onended=function(){var index=hissVoices.indexOf(source);if(index>=0)hissVoices.splice(index,1);source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};source.start();
      thermalCount++;thermalLog.push({kind:'quench',heatJ:heatJ,simulationTime:clock,audioTime:now,gain:amplitude});if(thermalLog.length>64)thermalLog.shift();return true;
    }
    function destroy() {
      if (retired) return;
      enableEpoch++; retired = true; enabled = false; silence();
      document.removeEventListener('visibilitychange', visibility);
      if (node) { node.port.onmessage = null; node.disconnect(); }
      if (master) master.disconnect();
      if (moduleUrl) URL.revokeObjectURL(moduleUrl);
      if (context && context.state !== 'closed') context.close().catch(function () {});
      log.length = 0;
      hissVoices.forEach(function(source){try{source.stop();}catch(e){}});hissVoices.length=0;thermalLog.length=0;hissBuffer=null;
      if(ventVoice){ventVoice.oscillator.stop();ventVoice.oscillator.disconnect();ventVoice.gain.disconnect();ventVoice.pan.disconnect();ventVoice=null;}ventLog.length=0;
    }
    document.addEventListener('visibilitychange', visibility);
    return { enable: enable, mute: mute, setActive: setActive, consume: consume, hiss:hiss, vent:vent, stats: stats, destroy: destroy };
  }
  window.WSSSound = Object.freeze({ create: create,ventFrequency:ventFrequency });
})();
