// Run: node tools/audio/test-music.cjs
// Advance timer and audio clocks independently to cover long quiet intervals.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/audio.js'), 'utf8');

function fixture(names = ['town1', 'town2', 'travel1', 'ug-l1', 'ug-l2', 'ug-l3', 'ug-l4', 'death']) {
  let wall = 0, timerId = 0;
  const timers = new Map(), sources = [];
  function param() {
    return { value: 1, events: [], cancelScheduledValues(t) { this.events.push(['cancel', t]); },
      setValueAtTime(v, t) { this.events.push(['set', v, t]); },
      linearRampToValueAtTime(v, t) { this.events.push(['linear', v, t]); },
      setTargetAtTime(v, t, tau) { this.events.push(['target', v, t, tau]); } };
  }
  function node() { return { gain: param(), frequency: param(), connect() {}, disconnect() {} }; }
  const audio = { currentTime: 0, state: 'running', resume() { this.state = 'running'; },
    createGain: node,
    createBufferSource() {
      const s = { connect() {}, disconnect() {}, start(t = audio.currentTime) { this.started = t; },
        stop(t = audio.currentTime) { this.stopAt = t; },
        finish() { this.finished = true; if (this.onended) this.onended(); } };
      sources.push(s); return s;
    }
  };
  const context = vm.createContext({ console, Float32Array, Uint8Array, Math: Object.assign(Object.create(Math), { random: () => .5 }),
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: wall + ms / 1000 }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() {}, clearInterval() {},
    __audio: audio, __node: node, __buffers: Object.fromEntries(names.map(name => [name, { name, duration: 30 }]))
  });
  // Instrument only the fixture, leaving the production API unchanged.
  vm.runInContext(source.replace('  // ===== public API', `
    // This fixture isolates scheduling with all songs resident; cache behavior
    // and asynchronous loading are covered by test-music-cache.cjs.
    ctx = __audio; buffers = __buffers; MUSIC_CACHE_LIMIT = 100;
    musicBus = __node(); depthFilter = __node(); sfxFilter = __node(); nightLP = __node(); musicDuck = __node();
    globalThis.__state = music; globalThis.__depthFilter = depthFilter;
    // ===== public API`), context);
  function tick(seconds, advanceAudio = true) {
    wall += seconds;
    if (advanceAudio) audio.currentTime += seconds;
    // Fire only callbacks that were due when this tick began.
    for (const [id, timer] of [...timers]) {
      if (timer.at <= wall && timers.has(id)) { timers.delete(id); timer.fn(); }
    }
  }
  function finish() {
    const v = context.__state.current;
    audio.currentTime = v.t0 + v.dur;
    v.src.finish();
  }
  return { api: context.SluiceAudio, state: context.__state, audio, timers, sources, tick, finish, context };
}

const f = fixture();
f.api.setMusic('towns'); f.tick(0);
const first = f.state.current;
assert(first && !first.loop && !first.src.loop, 'World cues must play once');
assert.deepEqual(first.gain.gain.events, [['set', 0, 0], ['linear', 1, 6], ['set', 1, 22.5], ['linear', 0, 30]]);
for (let i = 0; i < 100; i++) {
  f.api.setMusic(i % 2 ? 'towns' : 'underground');
  f.api.setDepth(i % 2 ? 47 : 300);
  f.api.setDanger(i % 3 === 0);
}
assert.equal(f.state.current, first, 'Surface, biome, and danger crossings must not restart a song');
assert.equal(first.src.stopAt, undefined, 'Crossings must not fade out the current song');
assert.equal(f.sources.length, 1, 'Crossings must not stack new sources');
f.api.setMusic('underground'); f.api.setDanger(false); f.api.setDepth(300);
f.finish();
assert.equal(f.state.current, null);
assert.equal(f.api.nowPlaying().length, 0, 'The readout is empty in a quiet interval');
const deadline = f.state.nextAt;
assert(deadline - f.audio.currentTime >= 150 && deadline - f.audio.currentTime <= 300);
const gapTimer = f.state.timer;
for (let i = 0; i < 100; i++) {
  f.api.setMusic(i % 2 ? 'towns' : 'underground'); f.api.setDepth(i % 2 ? 0 : 300); f.api.setDanger(i % 3 === 0);
}
assert.equal(f.state.nextAt, deadline, 'Crossings must preserve the quiet deadline');
assert.equal(f.state.timer, gapTimer, 'Crossings must preserve the timer');
assert.equal(f.timers.size, 1);
f.api.setMusic('underground'); f.api.setDepth(300); f.api.setDanger(false);
f.tick(deadline - f.audio.currentTime - .01);
assert.equal(f.state.current, null, 'No early cue in a quiet interval');
f.tick(.02);
assert.equal(f.state.current.name, 'ug-l3', 'The next cue uses the latest depth');
f.api.setDanger(true);
assert.equal(f.state.current.name, 'ug-l3');
f.finish(); f.tick(f.state.nextAt - f.audio.currentTime);
assert.equal(f.state.current.name, 'ug-l4');
assert.equal(f.state.current.loop, false, 'Danger must also leave quiet intervals');
f.finish(); f.tick(20); f.api.setDanger(false);
assert.equal(f.state.current, null, 'Recovering from danger must preserve the gap');
f.api.setMusic('towns');
f.tick(f.state.nextAt - f.audio.currentTime);
assert(f.state.current.name.startsWith('town'), 'A return to the surface is heard only on the next cue');
const townName = f.state.current.name;
f.finish();
assert(f.state.nextAt - f.audio.currentTime >= 90 && f.state.nextAt - f.audio.currentTime <= 240);
f.tick(f.state.nextAt - f.audio.currentTime);
assert.notEqual(f.state.current.name, townName, 'Available town cues do not immediately repeat');

// Suspended audio must not silently consume the gap or accumulate sources.
f.finish();
const suspendedDeadline = f.state.nextAt;
f.audio.state = 'suspended';
const sourceCount = f.sources.length;
f.tick(1000, false);
assert.equal(f.sources.length, sourceCount);
assert.equal(f.state.nextAt, suspendedDeadline);
f.audio.state = 'running';
f.tick(suspendedDeadline - f.audio.currentTime);
assert(f.state.current);

// A late ended callback from a cancelled voice cannot schedule another chain.
const oldEnded = f.state.current.src.onended;
f.api.death(); oldEnded();
assert.equal(f.api.musicMode(), null);
assert.equal(f.timers.size, 0, 'Death cancels the music schedule');
assert.equal(f.state.ugDanger, false);
f.tick(1000);
assert.equal(f.state.current, null);
f.api.revive(); f.api.setMusic('towns'); f.tick(0);
assert(f.state.current, 'Respawn restores one schedule');
f.finish(); f.api.setMusic(null); f.tick(1000);
assert.equal(f.state.current, null);
assert.equal(f.timers.size, 0, 'Explicit stop cancels a pending gap');

// Missing tracks retry without overlapping chains and recover as loading ends.
const missing = fixture([]);
missing.api.setMusic('underground'); missing.api.setDepth(300); missing.api.setDanger(true); missing.tick(0);
assert.equal(missing.state.current, null);
assert.equal(missing.timers.size, 1);
missing.context.__buffers['ug-l2'] = { name: 'ug-l2', duration: 3 };
missing.tick(6);
assert.equal(missing.state.current.name, 'ug-l2', 'Missing danger and deep assets fall back to a loaded cue');
const shortEnvelope = missing.state.current.gain.gain.events.map(e => e[2]);
assert(shortEnvelope.every((t, i) => !i || t >= shortEnvelope[i - 1]), 'Short cue fades cannot overlap');
missing.api.setDepth(49); missing.api.setDepth(50); missing.api.setDepth(51);
assert.deepEqual(missing.context.__depthFilter.frequency.events.slice(-3).map(e => [e[0], e[1], e[3]]),
  [['target', 15100, 4], ['target', 15000, 4], ['target', 14900, 4]], 'Depth drifts slowly without a filter jump');

console.log('Music regressions passed: uninterrupted cues, preserved quiet gaps, current-depth picks, danger, suspension, cancellation, respawn, missing assets, and fades.');
