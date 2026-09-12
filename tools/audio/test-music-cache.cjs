// Deterministic delayed fetch/decode tests, without allocating real PCM.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../js/audio.js'), 'utf8');
let wall = 0, serial = 0, seed = 3241, active = 0, peak = 0;
const timers = new Map(), requests = [], history = [], sources = [];
function param() { return { value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} }; }
function node() { return { gain: param(), frequency: param(), connect() {}, disconnect() {} }; }
const audio = { currentTime: 0, state: 'running', createGain: node,
  decodeAudioData(ab, done) { active--; done({ name: ab.name, duration: 30, length: 1440000, numberOfChannels: 2 }); },
  createBufferSource() { const s = { connect() {}, disconnect() {}, start() {}, stop() {} }; sources.push(s); return s; }
};
const context = vm.createContext({ console, Float32Array, Uint8Array,
  Math: Object.assign(Object.create(Math), { random: () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296) }),
  setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, at: wall + ms / 1000 }); return id; },
  clearTimeout(id) { timers.delete(id); }, setInterval() {}, clearInterval() {},
  fetch(url) { const name = path.basename(url, '.m4a'); active++; peak = Math.max(peak, active); history.push(name); return new Promise(resolve => requests.push({ name, resolve })); },
  __audio: audio, __node: node
});
vm.runInContext(source.replace('  // ===== public API', `
  ctx = __audio; sfxLoadStarted = true;
  musicBus = __node(); musicDuck = __node(); depthFilter = __node(); sfxFilter = __node(); nightLP = __node();
  globalThis.__state = music; globalThis.__buffers = buffers;
  // ===== public API`), context);
const api = context.SluiceAudio, state = context.__state, buffers = context.__buffers;
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
async function drain(fail = []) {
  while (requests.length) {
    const r = requests.shift(), bad = fail.includes(r.name) || r.name.startsWith('event-');
    if (bad) active--;
    r.resolve({ ok: !bad, arrayBuffer: async () => ({ name: r.name }) }); await flush();
  }
}
function nextTimer() {
  assert(timers.size === 1, 'Exactly one music timer');
  const [id, timer] = [...timers][0], delta = Math.max(0, timer.at - wall);
  wall += delta; audio.currentTime += delta; timers.delete(id); timer.fn();
}
function finish() { const v = state.current; assert(v); audio.currentTime = v.t0 + v.dur; v.src.onended(); }
async function playNext() { for (let i = 0; !state.current && i < 12; i++) { nextTimer(); await drain(); } assert(state.current, 'Next cue eventually plays'); }
(async () => {
  api.unlock(); assert.deepEqual(history, ['town1'], 'Only one decode is in flight'); await drain();
  assert.deepEqual(Object.keys(buffers).sort(), ['death', 'town1'], 'Boot does not decode dormant songs or combat');
  api.setMusic('towns'); nextTimer(); assert.equal(state.current.name, 'town1', 'Opening song is already warm');
  const heard = new Set([state.current.name]);
  for (let i = 0; i < 80; i++) {
    const last = state.current.name; finish(); const deadline = state.nextAt;
    nextTimer(); assert.equal(state.current, null, 'Prefetch does not shorten the quiet gap');
    assert.equal(state.nextAt, deadline); await drain(); await playNext();
    assert.notEqual(state.current.name, last); heard.add(state.current.name);
    assert(Object.keys(buffers).length <= 4, 'Decoded cache stays bounded');
    assert(buffers.death && buffers[state.current.name], 'Death and playing song stay resident');
  }
  assert.deepEqual([...heard].sort(), ['town1', 'town2', 'town3', 'town5', 'town7', 'town8', 'town9'], 'Full intended playlist remains available');
  finish(); const deadline = state.nextAt; nextTimer(); await drain();
  api.setMusic('underground'); api.setDepth(300); api.setDanger(true);
  assert.equal(state.nextAt, deadline, 'Late context change preserves the gap');
  nextTimer(); assert.equal(state.current, null); await drain(['ug-l4']);
  await playNext(); assert.equal(state.current.name, 'ug-l3', 'Failed danger cue falls back to current depth');
  const current = state.current;
  api.combat(true, 2); api.combat(false); await drain();
  assert.equal(state.combat, null, 'A late combat decode cannot start a cancelled layer');
  assert.equal(state.current, current, 'Loading and eviction preserve the active song');
  assert.equal(peak, 1, 'Long music tracks decode sequentially');
  api.death(); assert.equal(state.oneShot.name, 'death'); assert.equal(timers.size, 0);
  console.log('PASS: bounded music cache, 80 full-pool cues, prefetch timing, delayed/failed loading, one decode at a time, cancelled combat, and immediate death cue.');
})().catch(error => { console.error(error); process.exitCode = 1; });
