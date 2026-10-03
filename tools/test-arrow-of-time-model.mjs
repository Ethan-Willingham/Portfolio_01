import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evolve, neighbors, prepare, energyTwice, pack, unpack, compare, measure, checksum } from '../js/arrow-of-time-model.js';
const state = (width, height, a, b) => ({ width, height, x: Int8Array.from({ length: width * height }, (_, i) => (a >>> i & 1) * 2 - 1), y: Int8Array.from({ length: width * height }, (_, i) => (b >>> i & 1) * 2 - 1) });
assert.deepEqual(neighbors(0, 4, 4), [3, 1, 12, 4]);
assert.deepEqual(neighbors(15, 4, 4), [14, 12, 11, 3]);
for (const [w, h] of [[2, 2], [2, 4]]) {
  const fields = 2 ** (w * h);
  for (let a = 0; a < fields; a++) for (let b = 0; b < fields; b++) {
    const s = state(w, h, a, b), f = evolve(s), r = evolve(s, -1);
    assert.ok(compare(evolve(f, -1), s).exact); assert.ok(compare(evolve(r), s).exact);
    assert.equal(energyTwice(f), energyTwice(s)); assert.equal(energyTwice(r), energyTwice(s));
  }
  console.log(`PASS all ${fields * fields} two-layer states of ${w}x${h}, both compositions and energy`);
}
const supplied = new URL('../assets/visualizer/arrow-of-time/fixtures.json', import.meta.url);
if (fs.existsSync(supplied)) for (const f of JSON.parse(fs.readFileSync(supplied)).fixtures) {
  let s = { width: f.L, height: f.L, x: Int8Array.from(f.initial_x), y: Int8Array.from(f.initial_y) }, original = s;
  assert.equal(energyTwice(s), f.initial_energy_twice_J);
  for (const frame of f.forward_states) { s = evolve(s); assert.deepEqual([...s.x], frame.x); assert.deepEqual([...s.y], frame.y); assert.equal(energyTwice(s), frame.energy_twice_J); }
  for (let k = 0; k < f.inverse_steps_to_return; k++) s = evolve(s, -1);
  assert.ok(compare(original, s).exact); console.log('PASS supplied fixture ' + f.id);
}
// Exercise each possible neighbor sum while the second time layer is independent.
for (let mask = 0; mask < 16; mask++) {
  const s = state(4, 4, 65535, 0); neighbors(5, 4, 4).forEach((j, k) => { s.x[j] = (mask >>> k & 1) * 2 - 1; });
  const sum = neighbors(5, 4, 4).reduce((n, j) => n + s.x[j], 0); assert.equal(evolve(s).x[5], sum === 0 ? 1 : -1);
}
for (const [w, h] of [[2, 2], [30, 6], [32, 8], [34, 10], [64, 16], [66, 4], [256, 256], [512, 512]]) {
  let s = prepare(w, h), original = s, e = energyTwice(s);
  assert.deepEqual(unpack(pack(s.x, w, h), w, h), s.x);
  const packed = pack(s.x, w, h), last = w % 32;
  if (last) for (let row = 0; row < h; row++) assert.equal(packed[row * Math.ceil(w / 32) + Math.ceil(w / 32) - 1] >>> last, 0);
  const steps = w >= 256 ? 768 : 128;
  for (let k = 0; k < steps; k++) { s = evolve(s); assert.equal(energyTwice(s), e); }
  for (let k = 0; k < steps; k++) { s = evolve(s, -1); assert.equal(energyTwice(s), e); }
  assert.ok(compare(s, original).exact); assert.equal(checksum(pack(s.x, w, h), pack(s.y, w, h)), checksum(pack(original.x, w, h), pack(original.y, w, h)));
  console.log(`PASS ${w}x${h} packing and ${steps}+${steps} exact steps`);
}
for (const id of ['hourglass', 'rings', 'window']) {
  const s = prepare(256, 256, id), m = measure(s); assert.ok(m.flippableFraction > .03); assert.ok(Math.abs(m.energyPerSite + Math.SQRT2) < .001);
  console.log(id, JSON.stringify(m));
}
console.log('All integer checks have zero tolerance.');

// Rectangular production tiers retain energy and expose fewer alternating cells.
for (const [width,height] of [[768,512],[1024,768]]) {
  const initial=prepare(width,height), energy=energyTwice(initial); let state=initial, changesX=0,changesPair=0;
  for(let k=0;k<96;k++){const next=evolve(state);assert.equal(energyTwice(next),energy);
    for(let i=0;i<state.x.length;i++){const changed=state.x[i]+state.y[i]!==next.x[i]+next.y[i];if(changed){const sum=neighbors(i,width,height).reduce((v,j)=>v+state.x[j],0);assert.equal(sum,0);}if(k>=72){changesPair+=changed;changesX+=state.x[i]!==next.x[i];}}
    state=next;
  }
  assert.ok(changesPair<changesX);for(let k=0;k<96;k++)state=evolve(state,-1);assert.ok(compare(state,initial).exact);
  console.log(`PASS ${width}x${height} 96+96 exact steps; paired display changes ${changesPair} / single-layer changes ${changesX}`);
}
