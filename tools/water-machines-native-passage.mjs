// Passive GPU observer for the cup. Reads native positions after every update;
// writes only its own history, flags, tile mask and counters.
export async function installNativePassage() {
  const T=window.__toy,L=T.liquid(),D=T.machineState().definition,M=window.__machineMeasurement;
  if(D.name!=='cup')throw Error('Native passage observer currently describes the cup route');
  const device=L.device,queue=L.queue,count=L.uploadedCount,tile=T.world().tile;
  const origin=M.sourceOrigin,pipe=D.pipes[0],a=pipe.points[2],b=pipe.points[3],out=origin.outletDefinition;
  const across=Math.ceil(pipe.bore/tile),negative=(Math.floor((across-1)/2)+.5)*tile,positive=pipe.bore-negative;
  const crest={axis:0,face:(a.x+b.x)/2,sign:Math.sign(b.x-a.x),lo:a.y-negative,hi:a.y+positive};
  const cols=Math.ceil(T.world().w/tile),rows=Math.ceil(T.world().h/tile),pipeTiles=new Uint32Array(cols*rows);
  for(const key of origin.pipeInteriorTiles){const [x,y]=key.split(',').map(Number);pipeTiles[y*cols+x]=1;}
  const flags=new Uint32Array(count);for(const id of origin.bulkIds)flags[id]=1;
  const owned=[];const buffer=(label,size)=>{const v=device.createBuffer({label:'passage.'+label,size,
    usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});owned.push(v);return v;};
  const history=buffer('history',count*16),marks=buffer('marks',count*4),mask=buffer('pipeTiles',pipeTiles.byteLength),stats=buffer('stats',40),
    largestMoves=buffer('largestMoves',count*16),largestMoveMeta=buffer('largestMoveMeta',count*32);
  const stepConfig=device.createBuffer({label:'passage.clock',size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});owned.push(stepConfig);
  queue.writeBuffer(marks,0,flags);queue.writeBuffer(mask,0,pipeTiles);
  const seed=device.createCommandEncoder();seed.copyBufferToBuffer(L.buf.pos,0,history,0,count*16);queue.submit([seed.finish()]);
  const f=x=>Number(x).toFixed(8),R=D.measure.receiver,S=D.measure.source;
  const code=`
@group(0) @binding(0) var<storage,read> pos:array<vec4<f32>>;
@group(0) @binding(1) var<storage,read_write> previous:array<vec4<f32>>;
@group(0) @binding(2) var<storage,read_write> flags:array<u32>;
@group(0) @binding(3) var<storage,read> pipeTiles:array<u32>;
@group(0) @binding(4) var<storage,read_write> stats:array<atomic<u32>>;
@group(0) @binding(5) var<storage,read_write> largestMoves:array<vec4<f32>>;
@group(0) @binding(6) var<storage,read_write> largestMoveMeta:array<vec4<f32>>;
@group(0) @binding(7) var<uniform> stepConfig:vec4<f32>;
fn crosses(a:vec2<f32>,b:vec2<f32>,axis:u32,face:f32,sign:f32,lo:f32,hi:f32)->bool {
  let da=(a[axis]-face)*sign;let db=(b[axis]-face)*sign;
  if(da>=0.0 || db<0.0){return false;}
  let t=da/(da-db);let along=mix(a[1u-axis],b[1u-axis],t);
  return along>=lo && along<=hi;
}
fn receiver(p:vec2<f32>)->bool {
  if(p.x<${f(R.x+tile)} || p.x>=${f(R.x+R.width-tile)} || p.y<${f(R.y)} || p.y>=${f(R.y+R.height-tile)}){return false;}
  let c=vec2<i32>(floor(p/${f(tile)}));
  if(c.x<0 || c.y<0 || c.x>=${cols} || c.y>=${rows}){return false;}
  return pipeTiles[u32(c.y)*${cols}u+u32(c.x)]==0u;
}
@compute @workgroup_size(128)
fn advance(@builtin(global_invocation_id) id:vec3<u32>){
  let i=id.x;if(i>=${count}u || (flags[i]&1u)==0u){return;}
  let a=previous[i].xy;let b=pos[i].xy;var mark=flags[i];
  atomicMax(&stats[8],bitcast<u32>(length(b-a)));
  let recorded=largestMoves[i];
  if(length(b-a)>length(recorded.zw-recorded.xy)){largestMoves[i]=vec4<f32>(a,b);
    largestMoveMeta[i*2u]=vec4<f32>(previous[i].zw,pos[i].zw);largestMoveMeta[i*2u+1u]=stepConfig;}
  if(crosses(a,b,0u,${f(crest.face)},${f(crest.sign)},${f(crest.lo)},${f(crest.hi)})){mark=mark|2u;}
  if((mark&2u)!=0u && crosses(a,b,${out.axis==='x'?0:1}u,${f(out.face)},${f(out.positive)},${f(out.alongMin)},${f(out.alongMax)})){mark=mark|4u;}
  if(crosses(a,b,0u,${f(S.x)},-1.0,-10000.0,${f(S.y+tile)}) ||
     crosses(a,b,0u,${f(S.x+S.width)},1.0,-10000.0,${f(S.y+tile)})){mark=mark|8u;}
  if((mark&6u)==6u && receiver(b)){mark=mark|16u;}
  flags[i]=mark;previous[i]=pos[i];
}
@compute @workgroup_size(128)
fn finish(@builtin(global_invocation_id) id:vec3<u32>){
  let i=id.x;if(i>=${count}u || (flags[i]&1u)==0u){return;}let mark=flags[i];let arrived=receiver(pos[i].xy);
  atomicAdd(&stats[0],1u);
  if((mark&2u)!=0u){atomicAdd(&stats[1],1u);}
  if((mark&4u)!=0u){atomicAdd(&stats[2],1u);}
  if((mark&16u)!=0u){atomicAdd(&stats[3],1u);}
  if(arrived){atomicAdd(&stats[4],1u);if((mark&6u)==6u){atomicAdd(&stats[5],1u);}}
  if((mark&8u)!=0u){atomicAdd(&stats[6],1u);if(arrived){atomicAdd(&stats[7],1u);}}
}`;
  const shader=device.createShaderModule({label:'passage.readOnlyNative',code});
  const info=await shader.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');
  if(errors.length)throw Error(errors.map(m=>m.message).join('\n'));
  const entries=[0,1,2,3,4,5,6,7].map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,
    buffer:{type:binding===7?'uniform':binding===0||binding===3?'read-only-storage':'storage'}}));
  const layout=device.createBindGroupLayout({entries}),pl=device.createPipelineLayout({bindGroupLayouts:[layout]});
  const pipelines=Object.fromEntries(['advance','finish'].map(entryPoint=>[entryPoint,device.createComputePipeline({layout:pl,compute:{module:shader,entryPoint}})]));
  const bg=device.createBindGroup({layout,entries:[L.buf.pos,history,marks,mask,stats,largestMoves,largestMoveMeta,stepConfig].map((buffer,binding)=>({binding,resource:{buffer}}))});
  function dispatch(name){const e=device.createCommandEncoder({label:'passage.'+name}),p=e.beginComputePass();
    p.setPipeline(pipelines[name]);p.setBindGroup(0,bg);p.dispatchWorkgroups(Math.ceil(count/128));p.end();queue.submit([e.finish()]);}
  const original=L.update;let updates=0,maxStep=0;
  function wrapped(dt){const before=L.simulationClock,result=original.call(L,dt);if(L.simulationClock>before){
    if(L.uploadedCount!==count)throw Error('Native passage requires stable particle indices');
    maxStep=Math.max(maxStep,L.simulationClock-before);updates++;
    queue.writeBuffer(stepConfig,0,new Float32Array([L.simulationClock-M.startSimulation,L.simulationClock-before,0,0]));dispatch('advance');}return result;}
  L.update=wrapped;
  return {
    async capture(){dispatch('finish');const read=device.createBuffer({size:48+count*48,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      try{const e=device.createCommandEncoder();e.copyBufferToBuffer(stats,0,read,0,40);e.copyBufferToBuffer(largestMoves,0,read,48,count*16);e.copyBufferToBuffer(largestMoveMeta,0,read,48+count*16,count*32);
        queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);
        const bytes=read.getMappedRange(),u=new Uint32Array(bytes,0,10),v=new Float32Array(bytes,0,10),moves=new Float32Array(bytes,48,count*4),meta=new Float32Array(bytes,48+count*16,count*8),largest=[];
        for(const id of origin.bulkIds){const i=id*4,from=[moves[i],moves[i+1]],to=[moves[i+2],moves[i+3]],distance=Math.hypot(to[0]-from[0],to[1]-from[1]);
          if(largest.length<20||distance>largest.at(-1).distance){largest.push({id,distance,from,to,fromVelocity:[meta[id*8],meta[id*8+1]],toVelocity:[meta[id*8+2],meta[id*8+3]],simulationSeconds:meta[id*8+4],updateSeconds:meta[id*8+5]});largest.sort((a,b)=>b.distance-a.distance);largest.length=Math.min(20,largest.length);}}
        return {definition:'Read-only GPU tracking after every native update. Initial pipe primer is excluded. Final receiver excludes the exact pipe interior.',
          updates,maximumUpdateSeconds:maxStep,maximumBulkDisplacementBetweenObservations:v[8],largestObservedMoves:largest,initialBulk:u[0],crossedCrest:u[1],exitedAfterCrest:u[2],
          everReceivedAfterPassage:u[3],finalBulkInReceiver:u[4],finalBulkInReceiverAfterPassage:u[5],spilledOverRim:u[6],finalSpilledInReceiver:u[7],crest,outlet:out};
      }finally{read.unmap();read.destroy();}},
    async close(){if(L.update===wrapped)L.update=original;await queue.onSubmittedWorkDone();for(const b of owned)b.destroy();}
  };
}
