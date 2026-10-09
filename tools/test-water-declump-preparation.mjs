#!/usr/bin/env node
// Fault-injected activation of the exact optional preparation function.
// Tests readiness and ownership, independent of GPU execution/correctness.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
assert(process.env.AFTER,'AFTER identifies the optional native candidate');
const source=fs.readFileSync(process.env.AFTER,'utf8'),start=source.indexOf('  function prepareDeclumpJacobi(instance) {');
const end=source.indexOf('  function runDeclump(instance)',start);
assert(start>=0&&end>start,'Candidate has the preparation function');
const definition=source.slice(start,end),rows=[];
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(options={}){
  const buffers=[],pending=[],scopes=[],lost=defer();let pops=0,bindings=0;
  const device={limits:{minUniformBufferOffsetAlignment:256},lost:lost.promise,
    pushErrorScope:filter=>scopes.push(filter),popErrorScope:()=>{assert(scopes.length);scopes.pop();pops++;
      return Promise.resolve(options.validationAt===pops?{message:'injected validation failure'}:null);},
    createBuffer:descriptor=>{const buffer={...descriptor,destroys:0,destroy(){this.destroys++;}};buffers.push(buffer);return buffer;},
    createBindGroupLayout:d=>d,createPipelineLayout:d=>d,createShaderModule:d=>d,
    createBindGroup:d=>{bindings++;if(options.bindingThrow&&bindings===2)throw new Error('injected binding failure');return d;},
    createComputePipelineAsync:d=>{if(options.pipelineThrow&&pending.length===1)throw new Error('injected synchronous pipeline failure');
      const p=defer();pending.push(p);return p.promise;}};
  const instance={device,queue:{writeBuffer(){}},declumpJacobi:1,declumpJacobiState:'idle',declumpJacobiDisposed:false,
    declumpReady:true,buffersReady:true,maxParticles:4096,paramsBuf:{name:'params'},buf:{}};
  ['pos','cellOf','cellCount','cellStart','sortedIdx','aux','flag','terrainMask'].forEach(k=>instance.buf[k]={name:k,size:65536});
  const original=Object.keys(instance.buf),context={Promise,Math,Object,String,Uint32Array,
    GPUBufferUsage:{STORAGE:1,COPY_DST:2,COPY_SRC:4,UNIFORM:8},GPUShaderStage:{COMPUTE:1},
    WGSL_DECLUMP:'struct DeclumpParams{};\n@group(0) @binding(0)\nvar<storage, read_write> pos : array<vec4<f32>>;sortedIdx : array<u32>;let j = sortedIdx[st + slot];pos[i] = vec4<f32>(np, pos[i].z, pos[i].w);'};
  vm.createContext(context);vm.runInContext(definition+'\nglobalThis.prepare=prepareDeclumpJacobi;',context);
  return {instance,buffers,pending,scopes,lost,original,prepare:()=>context.prepare(instance),
    resolve:()=>pending.forEach(p=>p.resolve({validated:true})),reject:()=>pending.forEach(p=>p.reject(new Error('injected async compilation failure')))};
}
const unchanged=f=>assert.deepEqual(Object.keys(f.instance.buf),f.original,'Resources remain unpublished');
const released=f=>assert(f.buffers.every(b=>b.destroys>=1),'Every private allocation destroyed');
{
  const f=fixture();f.instance.declumpJacobi=0;assert.equal(await f.prepare(),false);assert.equal(f.buffers.length,0);assert.equal(f.pending.length,0);
  rows.push({case:'default-off-no-resources',pass:true});
}
{
  const f=fixture(),p=f.prepare();assert.equal(f.instance.declumpJacobiState,'compiling');assert.equal(f.prepare(),p);
  unchanged(f);assert.equal(f.scopes.length,0,'Scope closed before async compilation finishes');f.resolve();assert.equal(await p,true);
  assert.equal(f.instance.declumpJacobiState,'ready');assert(f.instance.buf.declumpMergeA);assert.equal(f.buffers.length,4);
  assert(f.buffers.every(b=>b.destroys===0));assert.equal(await f.prepare(),true);assert.equal(f.buffers.length,4);
  rows.push({case:'atomic-ready-and-reuse',pass:true});
}
for(const failure of ['async-rejection','sync-throw','resource-validation','binding-validation','binding-throw']){
  const f=fixture({pipelineThrow:failure==='sync-throw',validationAt:failure==='resource-validation'?1:failure==='binding-validation'?2:0,bindingThrow:failure==='binding-throw'});
  const p=f.prepare();if(failure==='async-rejection')f.reject();else f.resolve();assert.equal(await p,false);unchanged(f);released(f);
  assert.equal(f.instance.declumpJacobiState,'failed');assert(f.instance.declumpJacobiError);assert.equal(f.scopes.length,0);
  assert.equal(await f.prepare(),false,'Failure does not report stale success');rows.push({case:failure,pass:true});
}
{
  const f=fixture(),p=f.prepare();f.instance.declumpJacobiDisposed=true;f.instance.declumpJacobiRequest=null;f.instance.declumpJacobiState='disposed';
  f.resolve();assert.equal(await p,false);unchanged(f);released(f);assert.equal(f.instance.declumpJacobiState,'disposed');
  rows.push({case:'dispose-before-completion',pass:true});
}
{
  const f=fixture(),p=f.prepare();f.lost.resolve({message:'injected device loss'});await tick();f.resolve();assert.equal(await p,false);
  unchanged(f);released(f);assert.equal(f.instance.declumpJacobiState,'failed');assert.equal(await f.prepare(),false);
  rows.push({case:'device-loss-during-preparation',pass:true});
}
{
  const f=fixture(),p=f.prepare();f.resolve();assert.equal(await p,true);f.lost.resolve({message:'injected device loss'});await tick();
  released(f);assert.equal(f.instance.declumpJacobiState,'failed');assert.equal(await f.prepare(),false);
  rows.push({case:'device-loss-after-readiness',pass:true});
}
{
  const f=fixture(),p=f.prepare();f.instance.declumpJacobi=0;f.resolve();assert.equal(await p,true);
  assert.equal(f.instance.declumpJacobi,0,'Completing compilation does not re-enable the request');
  rows.push({case:'disable-during-compilation-keeps-request-off',pass:true});
}
const report={pass:true,rows,sourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),
  scope:'Fault-injected exact preparation function with mocked WebGPU resources. Does not validate shader results or hardware performance.'};
if(process.env.DUMP)fs.writeFileSync(process.env.DUMP,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:true,cases:rows.length}));
