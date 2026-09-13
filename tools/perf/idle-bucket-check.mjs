// An intermittent repaint must stop looking expensive after cached frames.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../../js/sluice/020-state.js',import.meta.url),'utf8');
const begin=source.indexOf('  function perfRecord(');
const end=source.indexOf('  // v12.4',begin);
assert(begin>0 && end>begin);
const state={perfBuckets:{},perfBucketsRaw:{},perfBucketsPk:{}};
vm.createContext(state);
vm.runInContext(source.slice(begin,end),state);
function frame(cargo){
  state.perfBucketsRaw={};
  state.perfRecord('render.total',2);
  if(cargo!==undefined)state.perfRecord('console.cargo',cargo);
  state.perfDecayIdleBuckets();
}
frame(12);
assert(Math.abs(state.perfBuckets['console.cargo']-1.2)<1e-12);
assert.equal(state.perfBucketsPk['console.cargo'],12);
for(let i=0;i<144;i++)frame();
assert(state.perfBuckets['console.cargo']<.000001,'idle repaint average fades within one second at 144 Hz');
assert(state.perfBucketsPk['console.cargo']<.04,'idle peak fades too');
assert.equal(state.perfBucketsRaw['console.cargo'],undefined,'idle frames do not invent raw timing samples');
assert(Math.abs(state.perfBuckets['render.total']-2)<.000001,'active timers are not decayed twice');
frame(14);
assert.equal(state.perfBucketsPk['console.cargo'],14,'new repaint replaces the faded peak');
assert(state.perfBuckets['console.cargo']>1.4,'new repaint appears in the ranking');
console.log('PASS intermittent and active profiler costs');
