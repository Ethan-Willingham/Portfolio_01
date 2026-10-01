// Untimed recorder differential with timestamps beyond Number integer precision.
// No browser, GPU or game loop. Covers empty indirect queries and partial samples.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const source=fs.readFileSync(new URL('../js/sluice-performance-gpu.js',import.meta.url),'utf8');
const base=(1n<<63n)+123n;
async function capture(pairs){
 const times=new BigUint64Array(1024);pairs.forEach(([begin,end],i)=>{times[i*2]=begin;times[i*2+1]=end;});
 const seen=[];
 const device={features:new Set(['timestamp-query']),lost:new Promise(()=>{}),
  createQuerySet:()=>({destroy(){}}),
  createBuffer:()=>({mapState:'unmapped',mapAsync(){this.mapState='mapped';return Promise.resolve();},
   getMappedRange:()=>times.buffer,unmap(){this.mapState='unmapped';},destroy(){}}),
  createCommandEncoder:()=>({beginComputePass:descriptor=>{seen.push(descriptor);return {end(){}};},
   beginRenderPass:descriptor=>{seen.push(descriptor);return {end(){}};},
   resolveQuerySet(){},copyBufferToBuffer(){},finish:()=>({})}),queue:{submit:()=>undefined}};
 class Adapter{features=new Set(['timestamp-query']);async requestDevice(){return device;}}
 let clock=2000;
 const context=vm.createContext({window:{GPUAdapter:Adapter,__sluicePerformance:{frameId:42}},GPUAdapter:Adapter,
  performance:{now:()=>++clock},GPUBufferUsage:{QUERY_RESOLVE:1,COPY_SRC:2,MAP_READ:4,COPY_DST:8},GPUMapMode:{READ:1},BigUint64Array});
 vm.runInContext(source,context,{filename:fileURLToPath(new URL('../js/sluice-performance-gpu.js',import.meta.url))});
 const trace=context.window.__sluiceGPUTrace,adapter=new Adapter();
 await adapter.requestDevice();trace.setActive(true);
 const encoder=device.createCommandEncoder({label:'liquid.frame'});
 for(let i=0;i<pairs.length;i++)encoder.beginComputePass({label:'pass'+i}).end();
 device.queue.submit([encoder.finish()]);
 await new Promise(resolve=>setImmediate(resolve));
 const rows=JSON.parse(JSON.stringify(trace.drain()));
 assert.equal(rows.length,1);assert.equal(rows[0].frameId,42);
 assert.equal(seen[0].timestampWrites.beginningOfPassWriteIndex,0);
 assert.equal(trace.status().pending,0);return rows[0];
}
const complete=await capture([[base,base+500000n],[0n,0n],[base+1300000n,base+1400000n]]);
assert.equal(complete.ms,.6);assert.equal(complete.spanMs,1.4);
assert.equal(complete.passes[0].beginNs,base.toString());
assert.equal(complete.passes[1].emptyTimestamp,true);assert.equal(complete.partial,false);
const invalid=await capture([[base,base+500000n],[base+1000n,base-1000n]]);
assert.equal(invalid.invalidTimestamp,true);assert.equal(invalid.partial,true);
assert.equal(invalid.ms,.5);
const halfEmpty=await capture([[0n,100000n]]);
assert.equal(halfEmpty.invalidTimestamp,true);assert.equal(halfEmpty.partial,true);
const empty=await capture([[0n,0n],[0n,0n]]);
assert.equal(empty.ms,0);assert.equal(empty.spanMs,null);assert.equal(empty.partial,false);
console.log(JSON.stringify({passed:true,cases:4,bigintRawTimestamps:true,emptyDispatches:true,invalidPartialSamples:true,browserLaunched:false}));
