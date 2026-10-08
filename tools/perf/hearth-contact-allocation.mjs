// Exact contact/state comparison against the previous wall-allocation placement.
// CPU-only; BENCH=1 adds an optional serial timing run, with no GPU/browser work.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';

const geometry=fs.readFileSync('js/sluice/077-hearth-geometry.js','utf8');
const early='        var limit = walls[wall].limit;';
const late='        var points = [];\n        var wallVertices=hearthWallHull';
assert(geometry.includes(early)&&geometry.replaceAll('\r\n','\n').includes(late),'Optimized allocation follows wall rejection');
const optimized=geometry.replaceAll('\r\n','\n');
const reference=optimized.replace(early,'        var limit = walls[wall].limit, points = [];')
  .replace(late,'        var wallVertices=hearthWallHull');
const parts=Object.fromEntries(['materials','combustion','fracture','physics'].map(name=>[name,fs.readFileSync('js/sluice/077-hearth-'+name+'.js','utf8')]));
function fixture(candidate,count=32,lit=false,counter=false) {
  let code=candidate?optimized:reference;
  if(counter)code=code.replace(candidate?'        var points = [];':'        var limit = walls[wall].limit, points = [];',
    candidate?'        allocationCount++; var points = [];':'        allocationCount++; var limit = walls[wall].limit, points = [];');
  const source=parts.materials+'\n'+parts.combustion+'\n'+parts.fracture+'\n'+code+'\n'+parts.physics;
  const context=vm.createContext({Math,console,allocationCount:0});
  vm.runInContext('(function(){'+source+'\n'+
    'globalThis.test={bed:hearthBeds.boiler,add:hearthAddChunk,step:hearthStepBed,contacts:hearthContacts,light:hearthLightChunk,save:hearthSave};})();',context);
  const api=context.test;
  for(let i=0;i<count;i++)api.add('boiler',210+(i%8)*65,35+Math.floor(i/8)*45);
  if(lit)for(let i=0;i<Math.min(3,count);i++)api.light(api.bed,api.bed.chunks[i]);
  return {context,api};
}
function snapshot(api){return JSON.stringify({bed:api.bed,save:api.save()});}
let checks=0;
for(const scenario of [{count:0,lit:false},{count:3,lit:false},{count:32,lit:false},{count:32,lit:true}]) {
  const before=fixture(false,scenario.count,scenario.lit,true),after=fixture(true,scenario.count,scenario.lit,true);
  for(let i=0;i<60;i++) {
    if(i===20&&scenario.count) {before.api.bed.chunks[0].held=true;after.api.bed.chunks[0].held=true;}
    if(i===30&&scenario.count) {before.api.bed.chunks[0].held=false;after.api.bed.chunks[0].held=false;}
    before.api.step(before.api.bed);after.api.step(after.api.bed);
    assert.equal(snapshot(after.api),snapshot(before.api),'Bit-identical full bed/contact state '+JSON.stringify(scenario)+' step '+i);checks++;
  }
  if(scenario.count)assert(after.context.allocationCount<before.context.allocationCount*.1,'Reject over90% of temporary wall arrays');
  console.log(JSON.stringify({scenario,ticks:60,beforeArrays:before.context.allocationCount,afterArrays:after.context.allocationCount}));
}
if(process.env.BENCH==='1') {
  const before=fixture(false),after=fixture(true);
  for(let i=0;i<120;i++){before.api.step(before.api.bed);after.api.step(after.api.bed);}
  const rows=[];
  function time(api){const start=performance.now();for(let i=0;i<1500;i++)api.contacts(api.bed,0);return performance.now()-start;}
  for(let round=0;round<6;round++) {
    const values=round%2?[time(after.api),time(before.api)].reverse():[time(before.api),time(after.api)];
    rows.push({beforeMs:values[0],afterMs:values[1]});
  }
  const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  console.log(JSON.stringify({benchmark:'1500 settled32-coal manifold rebuilds',rows,
    beforeMedianMs:median(rows.map(row=>row.beforeMs)),afterMedianMs:median(rows.map(row=>row.afterMs))}));
}
console.log(JSON.stringify({passed:true,exactStateChecks:checks,browserLaunched:false,GPUWork:false}));
