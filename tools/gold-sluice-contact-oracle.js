/* Isolated actual GPU contact operator, independent of the wash trajectory. */
async function goldSluiceContactOracle(){
 const device=__toy.liquid().device,rows=[];
 const source=LiquidMaterialSlipWGPU.grainContactSource(true);
 const module=device.createShaderModule({code:source});
 const info=await module.getCompilationInfo();
 if(info.messages.some(m=>m.type==='error'))throw Error(JSON.stringify(info.messages));
 const pipelines={},layouts={};
 for(const [name,bindings]of [['degrees',[0,3,4,5,6,7,8]],['contacts',[0,1,2,3,4,5,6,7,8,9]]]){
  layouts[name]=device.createBindGroupLayout({entries:bindings.map(binding=>({binding,visibility:GPUShaderStage.COMPUTE,
   buffer:{type:binding<2?'uniform':[2,5,9].includes(binding)?'storage':'read-only-storage'}}))});
  pipelines[name]=device.createComputePipeline({layout:device.createPipelineLayout({bindGroupLayouts:[layouts[name]]}),compute:{module,entryPoint:name}});
 }
 const fixtures=[
  {name:'different-masses',p:[[10,10,12,0,65],[11,10,-6,0,77]]},
  {name:'equal-masses',matched:true,p:[[10,10,12,0,65],[11,10,-6,0,77]]},
  {name:'equal-swapped-tags',matched:true,p:[[10,10,12,0,77],[11,10,-6,0,65]]},
  {name:'separating',p:[[10,10,-12,0,65],[11,10,6,0,77]]},
  {name:'friction',p:[[10,10,12,8,65],[11,10,-6,-9,77]]},
  {name:'three-grain-chain',p:[[10,10,10,2,65],[11,10,0,0,77],[12,10,-10,-2,65]]},
  {name:'coincident',p:[[10,10,2,0,65],[10,10,-2,0,77]]},
  {name:'magnetite-quartz',p:[[10,10,12,0,73],[11,10,-6,0,65]]},
  {name:'magnetite-gold',p:[[10,10,12,0,73],[11,10,-6,0,77]]},
  {name:'three-mineral-chain',p:[[10,10,10,2,65],[11,10,0,0,73],[12,10,-10,-2,77]]},
  {name:'no-contact',p:[[10,10,12,0,65],[13,10,-6,0,77]]}
 ];
 for(const fixture of fixtures){
  const buffers=[],n=fixture.p.length,positions=new Float32Array(n*4),flags=new Uint32Array(n),counts=new Uint32Array(64),starts=new Uint32Array(64),sorted=new Uint32Array(n);
  fixture.p.forEach((p,i)=>{positions.set(p.slice(0,4),i*4);flags[i]=p[4];counts[Math.floor(p[1]/2.5)*8+Math.floor(p[0]/2.5)]++;});
  for(let i=1;i<64;i++)starts[i]=starts[i-1]+counts[i-1];
  const offsets=starts.slice();fixture.p.forEach((p,i)=>{sorted[offsets[Math.floor(p[1]/2.5)*8+Math.floor(p[0]/2.5)]++]=i;});
  function buffer(data,usage){const b=device.createBuffer({size:Math.max(16,data.byteLength),usage:usage|GPUBufferUsage.COPY_DST});buffers.push(b);device.queue.writeBuffer(b,0,data);return b;}
  const gp=new ArrayBuffer(80),ints=new Uint32Array(gp),floats=new Float32Array(gp);ints.set([n,8,8,0,0,64]);floats[6]=1/120;floats[7]=1/2.5;
  const cfg=new Float32Array(20);cfg.set([1,fixture.matched?2.65:5.2,2.65,fixture.matched?2.65:19.3]);
  const r=[buffer(new Uint8Array(gp),GPUBufferUsage.UNIFORM),buffer(cfg,GPUBufferUsage.UNIFORM),buffer(positions,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),
   buffer(positions,GPUBufferUsage.STORAGE),buffer(flags,GPUBufferUsage.STORAGE),buffer(new Uint32Array(n),GPUBufferUsage.STORAGE),
   buffer(counts,GPUBufferUsage.STORAGE),buffer(starts,GPUBufferUsage.STORAGE),buffer(sorted,GPUBufferUsage.STORAGE),buffer(new Float32Array(n*4),GPUBufferUsage.STORAGE)];
  const readback=device.createBuffer({size:n*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});buffers.push(readback);
  try{
   const enc=device.createCommandEncoder(),pass=enc.beginComputePass();
   for(const [name,bindings]of [['degrees',[0,3,4,5,6,7,8]],['contacts',[0,1,2,3,4,5,6,7,8,9]]]){
    const group=device.createBindGroup({layout:layouts[name],entries:bindings.map(binding=>({binding,resource:{buffer:r[binding]}}))});
    pass.setPipeline(pipelines[name]);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);
   }pass.end();enc.copyBufferToBuffer(r[2],0,readback,0,n*16);device.queue.submit([enc.finish()]);await readback.mapAsync(GPUMapMode.READ);
   const after=Array.from(new Float32Array(readback.getMappedRange()));
   function physical(p){let momentum=[0,0],energy=0,center=[0,0];
    fixture.p.forEach((entry,i)=>{const m=entry[4]===77?(fixture.matched?2.65:19.3):entry[4]===73?(fixture.matched?2.65:5.2):2.65;
     momentum[0]+=m*p[i*4+2];momentum[1]+=m*p[i*4+3];energy+=m*(p[i*4+2]**2+p[i*4+3]**2)/2;center[0]+=m*p[i*4];center[1]+=m*p[i*4+1];});return {momentum,energy,center};}
   rows.push({name:fixture.name,input:Array.from(positions),output:after,before:physical(positions),after:physical(after)});
  }finally{buffers.forEach(b=>b.destroy());}
 }
 return rows;
}
