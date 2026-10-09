// Passive Heron observer. Reads resident water after each native update and
// writes only observer-owned buffers. Initial nozzle water earns no credit.
export async function installNativeJet() {
  const T=window.__toy,L=T.liquid(),D=T.machineState().definition,M=window.__machineMeasurement;
  if(D.name!=='heron')throw Error('Native jet tracking requires Heron geometry');
  const pipe=D.pipes.find(p=>p.id==='nozzle'),points=pipe.points,tip=points.at(-1),before=points.at(-2);
  if(tip.x!==before.x || tip.y>=before.y)throw Error('A jet must leave an upward vertical nozzle');
  const device=L.device,queue=L.queue,count=L.uploadedCount,tile=T.world().tile;
  const negative=(Math.floor((pipe.bore/tile-1)/2)+.5)*tile,positive=pipe.bore-negative;
  const S=D.measure.source,B=D.measure.basin,face=D.measure.nozzle.y;
  // Put the first plane inside the ascending leg. A bend immediately above
  // the jar can turn sideways before crossing an arbitrary plane above its lid.
  const lid=Math.min(points[1].y-tile*2,Math.max(S.y+tile,points[2].y+tile*2)),leg=points[1].x,origin=M.sourceOrigin;
  const flags=new Uint32Array(count*4);for(const id of origin.bulkIds)flags[id*4]=1;
  const owned=[],make=(label,size,usage)=>{const b=device.createBuffer({label:'jet.'+label,size,usage});owned.push(b);return b;};
  const storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST;
  const previous=make('previous',count*16,storage),records=make('records',count*16,storage),stats=make('stats',4096,storage);
  const clock=make('clock',16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
  queue.writeBuffer(records,0,flags);
  const seed=device.createCommandEncoder();seed.copyBufferToBuffer(L.buf.pos,0,previous,0,count*16);queue.submit([seed.finish()]);
  const f=x=>Number(x).toFixed(8),source=`
@group(0) @binding(0) var<storage,read> pos:array<vec4<f32>>;
@group(0) @binding(1) var<storage,read_write> previous:array<vec4<f32>>;
@group(0) @binding(2) var<storage,read_write> records:array<vec4<u32>>;
@group(0) @binding(3) var<storage,read_write> stats:array<atomic<u32>>;
@group(0) @binding(4) var<uniform> clock:vec4<f32>;
fn inside(p:vec2<f32>,r:vec4<f32>)->bool {return p.x>=r.x && p.x<r.z && p.y>=r.y && p.y<r.w;}
fn up(a:vec2<f32>,b:vec2<f32>,y:f32,x0:f32,x1:f32)->bool {
  if(a.y<=y || b.y>y){return false;}
  let x=mix(a.x,b.x,(a.y-y)/(a.y-b.y));return x>=x0 && x<x1;
}
@compute @workgroup_size(128)
fn advance(@builtin(global_invocation_id) id:vec3<u32>){
  let i=id.x;if(i>=${count}u){return;}
  let a=previous[i].xy;let p=pos[i];previous[i]=p;
  if(up(a,p.xy,${f(face)},${f(tip.x-negative)},${f(tip.x+positive)})){atomicAdd(&stats[10],1u);}
  if(up(p.xy,a,${f(face)},${f(tip.x-negative)},${f(tip.x+positive)})){atomicAdd(&stats[13],1u);}
  if((records[i].x&1u)==0u){return;}var r=records[i];
  atomicMax(&stats[8],bitcast<u32>(length(p.xy-a)));
  if(up(a,p.xy,${f(lid)},${f(leg-negative)},${f(leg+positive)})){r.x=r.x|2u;}
  if((r.x&2u)!=0u && up(a,p.xy,${f(face)},${f(tip.x-negative)},${f(tip.x+positive)})){
    atomicAdd(&stats[11],1u);
    if((r.x&4u)==0u){r.w=bitcast<u32>(clock.x);atomicAdd(&stats[16u+min(999u,u32(floor(clock.x)))],1u);}
    r.x=r.x|4u;
  }
  if((r.x&2u)!=0u && up(p.xy,a,${f(face)},${f(tip.x-negative)},${f(tip.x+positive)})){atomicAdd(&stats[12],1u);}
  if((r.x&4u)!=0u){
    if(p.y<${f(face)} && abs(p.x-${f(tip.x)})<80.0){
      r.y=max(r.y,bitcast<u32>(${f(face)}-p.y));
      r.z=max(r.z,bitcast<u32>(max(0.0,-p.w)));
    }
    if(inside(p.xy,vec4<f32>(${f(B.x+tile)},${f(B.y)},${f(B.x+B.width-tile)},${f(B.y+B.height-tile)}))){r.x=r.x|8u;}
  }
  records[i]=r;previous[i]=p;
}
@compute @workgroup_size(128)
fn finish(@builtin(global_invocation_id) id:vec3<u32>){
  let i=id.x;if(i>=${count}u || (records[i].x&1u)==0u){return;}
  let r=records[i];let p=pos[i].xy;atomicAdd(&stats[0],1u);
  if((r.x&2u)!=0u){atomicAdd(&stats[1],1u);}
  if((r.x&4u)!=0u){atomicAdd(&stats[2],1u);}
  if((r.x&8u)!=0u){atomicAdd(&stats[3],1u);}
  if(inside(p,vec4<f32>(${f(S.x+tile)},${f(S.y)},${f(S.x+S.width-tile)},${f(S.y+S.height-tile)}))){atomicAdd(&stats[4],1u);}
  if(inside(p,vec4<f32>(${f(B.x+tile)},${f(B.y)},${f(B.x+B.width-tile)},${f(B.y+B.height-tile)}))){atomicAdd(&stats[5],1u);}
}`;
  const shader=device.createShaderModule({label:'jet.readOnlyNative',code:source});
  const info=await shader.getCompilationInfo(),errors=info.messages.filter(m=>m.type==='error');
  if(errors.length)throw Error(errors.map(m=>m.message).join('\n'));
  const layout=device.createBindGroupLayout({entries:[0,1,2,3,4].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,
    buffer:{type:binding===4?'uniform':binding===0?'read-only-storage':'storage'}}))});
  const pl=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const pipelines=Object.fromEntries(['advance','finish'].map(entryPoint=>[entryPoint,device.createComputePipeline({layout:pl,compute:{module:shader,entryPoint}})]));
  const bg=device.createBindGroup({layout,entries:[L.buf.pos,previous,records,stats,clock].map((buffer,binding)=>({binding,resource:{buffer}}))});
  function dispatch(name){const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipelines[name]);p.setBindGroup(0,bg);p.dispatchWorkgroups(Math.ceil(count/128));p.end();queue.submit([e.finish()]);}
  const original=L.update;let updates=0,maximumUpdateSeconds=0;
  function wrapped(dt){const before=L.simulationClock,result=original.call(L,dt);if(L.simulationClock>before){
    if(L.uploadedCount!==count)throw Error('Native jet tracking requires stable particle indices');
    updates++;maximumUpdateSeconds=Math.max(maximumUpdateSeconds,L.simulationClock-before);
    queue.writeBuffer(clock,0,new Float32Array([L.simulationClock-M.startSimulation,L.simulationClock-before,0,0]));dispatch('advance');}return result;}
  L.update=wrapped;
  return {
    async capture(){queue.writeBuffer(stats,0,new Uint32Array(8));dispatch('finish');
      const read=device.createBuffer({size:4096+count*16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      try{const e=device.createCommandEncoder();e.copyBufferToBuffer(stats,0,read,0,4096);e.copyBufferToBuffer(records,0,read,4096,count*16);queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);
        const bytes=read.getMappedRange(),s=new Uint32Array(bytes,0,1024),u=new Uint32Array(bytes,4096,count*4),v=new Float32Array(bytes,4096,count*4),sf=new Float32Array(bytes,0,1024);
        const parcels=origin.bulkIds.map(id=>({id,flags:u[id*4],peakRise:v[id*4+1],peakUpwardSpeed:v[id*4+2],firstEmissionSeconds:v[id*4+3]}));
        const emitted=parcels.filter(p=>(p.flags&4)!==0),rises=emitted.map(p=>p.peakRise).sort((a,b)=>a-b),quantile=q=>rises.length?rises[Math.floor(q*(rises.length-1))]:null;
        return {definition:'Resident source water is credited only after upward passage through an interior section of its ascending riser and then the actual nozzle mouth. Initial pipe water is excluded. Peak rise is measured within 80 world pixels of the nozzle. All buffers are observer-owned except read-only native positions.',
          updates,maximumUpdateSeconds,maximumBulkDisplacementBetweenObservations:sf[8],initialBulk:s[0],crossedRiser:s[1],emittedSourceParticles:s[2],returnedToBasin:s[3],finalBulkInSource:s[4],finalBulkInBasin:s[5],
          forwardSourceCrossings:s[11],backwardSourceCrossings:s[12],
          forwardWaterCrossings:s[10],backwardWaterCrossings:s[13],
          peakRise:{p50:quantile(.5),p95:quantile(.95),maximum:quantile(1)},
          emissionBySimulationSecond:Array.from(s.slice(16,1016)),parcels,
          riser:{y:lid,x0:leg-negative,x1:leg+positive},nozzle:{y:face,x0:tip.x-negative,x1:tip.x+positive}};
      }finally{read.unmap();read.destroy();}},
    async close(){if(L.update===wrapped)L.update=original;await queue.onSubmittedWorkDone();for(const b of owned)b.destroy();}
  };
}
