#!/usr/bin/env node
// Strict feature-off command, shader and allocation differential. No GPU is launched.
// BEFORE=/absolute/reference-liquid.js DUMP=/absolute/report.json node tools/test-water-pressure-feature-off.mjs
// Uses the established liquid-command-order mock, with current collision bind groups.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
assert(process.env.BEFORE,'BEFORE must identify the saved pre-change engine');
const files={before:path.resolve(process.env.BEFORE),after:path.resolve(process.env.AFTER||path.join(root,'js/liquid-wgpu.js'))};
const sources=Object.fromEntries(Object.entries(files).map(([name,file])=>[name,fs.readFileSync(file,'utf8')]));
const hash=text=>createHash('sha256').update(text).digest('hex');
const shaders=[...new Set(Object.values(sources).flatMap(source=>[...source.matchAll(/^  var (WGSL_[A-Z0-9_]+)\s*=/gm)].map(m=>m[1])))].sort();
const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
for(const name of Object.keys(sources)) {
  assert.equal(sources[name].split(marker).length,2,'Unique export marker '+name);
  sources[name]=sources[name].replace(marker,marker+'\n  window.__offShaders={'+shaders.map(key=>JSON.stringify(key)+':typeof '+key+'===\'string\'?'+key+':null').join(',')+'};');
}
const template=fs.readFileSync(path.join(root,'tools/perf/liquid-command-order.mjs'),'utf8');
let support=template.slice(template.indexOf('function instrument('),template.indexOf('let configurations ='));
const replaceOnce=(before,after)=>{
  assert.equal(support.split(before).length,2,'Current command fixture anchor: '+before);
  support=support.replace(before,after);
};
replaceOnce('return { device, queue, trace, writes, counts, fault, reset };',
  'return { device, queue, trace, writes, counts, fault, reset, buffers };');
replaceOnce('instance.collideBGs = Array.from({ length: 5 }, (_, n) => `collideBG.${n}`);',
  'instance.collideBGs = Array.from({ length: 5 }, (_, n) => `collideBG.${n}`);\n'+
  'instance.liquidPrimaryBGs = Array.from({length:5},(_,n)=>`liquidPrimaryBG.${n}`);\n'+
  'instance.liquidFallbackBGs = Array.from({length:5},(_,n)=>`liquidFallbackBG.${n}`);');
replaceOnce('return { api, instance, gpu, arrays, terrain };',
  'return { api, instance, gpu, arrays, terrain, shaders:context.window.__offShaders };');
const {fixture}=vm.runInNewContext(support+'\n;({fixture});',{assert,Buffer,vm,createHash,liquidPath:'js/liquid-wgpu.js'});
const rows=[],shaderHashes={},allocationHashes={};
let frames=0,disabledEncodeCalls=0;
for(const mode of ['omitted','attached-disabled']) {
  for(const sparse of [0,1])for(const bath of [0,1])for(const declump of [0,1])for(const fixed of [0,1]) {
    const config={sparse,bath,declump,fixed};
    const before=fixture(sources.before,config),after=fixture(sources.after,config);
    assert.equal(after.instance.pressureModel,undefined,'Default instance creates no pressure model');
    if(mode==='attached-disabled') {
      const model={enabled:false,setEnabled(value){this.enabled=!!value;},encode(){disabledEncodeCalls++;throw Error('Disabled model encoded');}};
      after.instance.setPressureModel(model);
      assert.equal(after.instance.pressureModel,model);
    }
    // One rendering-only uniform branch is allowed; every compute string
    // and the complete legacy drawing expression still compare exactly.
    const optInSurface = '  // Opt-in volume rendering uses equal kernels for equal native parcels.\n' +
      '  // The existing neighbour-count gate still keeps isolated drops small.\n' +
      '  if (rp._pad > 0.5 && material == 0u) { d = 1.5; }\n';
    for(const name of shaders) {
      const legacy=source=>name==='WGSL_SURFACE_FIELD'&&typeof source==='string'?source.replace(optInSurface,''):source;
      assert.equal(legacy(after.shaders[name]),legacy(before.shaders[name]),'Legacy WGSL expression '+name);
    }
    for(const [name,source] of Object.entries(after.shaders))if(source!==null)shaderHashes[name]=hash(source);
    const allocations=f=>f.gpu.buffers.map(b=>({label:b.label,size:b.size}));
    assert.deepEqual(allocations(after),allocations(before),'GPU buffer labels and sizes are unchanged');
    assert.equal(allocations(after).filter(b=>/liquid\.air\./.test(b.label)).length,0,'No air buffers');
    allocationHashes[JSON.stringify(config)]=hash(JSON.stringify(allocations(after)));
    const results=[];
    for(let frame=0;frame<3;frame++) {
      for(const f of [before,after]) {
        f.gpu.reset();f.instance.setSimParam('GRAVITY',810+frame*37);
        if(frame===2)f.instance.residentSeeded=false;
        f.api.runFrame(f.instance,1/30);
      }
      assert.deepEqual(after.gpu.trace,before.gpu.trace,'Every command and uniform byte: '+JSON.stringify({mode,config,frame}));
      assert.deepEqual(after.gpu.writes,before.gpu.writes,'Queue writes match');
      assert.deepEqual(after.gpu.counts,before.gpu.counts,'Encoders, submits and command buffers match');
      assert.equal(after.gpu.trace.filter(event=>event.some(value=>typeof value==='string'&&/liquid\.air\.|afterAir/.test(value))).length,0,'No air passes or pipelines');
      assert.equal(after.instance.frameEncoder,null,'Live encoder ownership is released');
      results.push({frame,traceSHA256:hash(JSON.stringify(after.gpu.trace)),counts:{...after.gpu.counts},
        passes:after.gpu.trace.filter(event=>event[0]==='beginPass').length});
      frames++;
    }
    rows.push({mode,config,bufferAllocations:after.gpu.buffers.length,frames:results});
  }
}
assert.equal(disabledEncodeCalls,0,'An explicitly disabled companion never encodes');
const report={schema:'water-pressure-feature-off-v1',pass:true,startedUTC:new Date().toISOString(),
  sources:Object.fromEntries(Object.entries(files).map(([name,file])=>[name,{path:file,sha256:hash(fs.readFileSync(file,'utf8'))}])),
  configurations:16,modes:2,framePairs:frames,legacyShaders:Object.keys(shaderHashes).length,shaderHashes,allocationHashes,
  airBufferAllocations:0,airPasses:0,disabledEncodeCalls,rows,
  limitation:'CPU command mock verifies ordering, uniforms and allocation intent. It does not execute GPU shaders; real WebGPU differential remains required.'};
if(process.env.DUMP)fs.writeFileSync(path.resolve(process.env.DUMP),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,framePairs:frames,legacyShaders:report.legacyShaders,
  airBufferAllocations:0,airPasses:0,disabledEncodeCalls,report:process.env.DUMP||null}));
