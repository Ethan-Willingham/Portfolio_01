// Sum the model's gas ledger after every pressure encode, including all native
// substeps. This measures accounting; it does not certify the phase model.
export async function installNativeGasBudget() {
  const L=window.__toy.liquid(),model=window.__toy.airModel(),device=L.device,queue=L.queue;
  const offset=model.width*model.height*16,scale=model.settings.volumeScale;
  const budget=device.createBuffer({label:'gasBudget.counter',size:128,
    usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
  const shader=device.createShaderModule({label:'gasBudget.readOnlyLedger',code:`
@group(0) @binding(0) var<storage,read> gas:array<u32>;
@group(0) @binding(1) var<storage,read_write> sums:array<u32>;
fn add64(at:u32,value:u32){let old=sums[at];sums[at]=old+value;if(sums[at]<old){sums[at+1u]=sums[at+1u]+1u;}}
@compute @workgroup_size(1)
fn observe(){
  let old=gas[${offset}u];let captured=gas[${offset+1}u];let amount=gas[${offset+2}u];
  let vented=gas[${offset+4}u];let unassigned=gas[${offset+5}u];
  if(sums[0]==0u){sums[13]=old;}
  sums[0]=sums[0]+1u;add64(1u,captured);add64(3u,vented);add64(5u,unassigned);
  let error=abs(bitcast<i32>(old+captured-amount-vented-unassigned));
  sums[7]=max(sums[7],u32(error));sums[8]=max(sums[8],gas[${offset+13}u]);
  sums[9]=max(sums[9],gas[${offset+14}u]);sums[10]=max(sums[10],gas[${offset+15}u]);
  sums[14]=amount;
  if(gas[${offset+15}u]>0u && sums[15]==0u){
    for(var c=0u;c<${model.width*model.height}u;c=c+1u){let at=c*16u;
      if(gas[at]>0u && bitcast<i32>(gas[at+8u])+bitcast<i32>(gas[at+15u])<=0){
        sums[15]=1u;sums[16]=c;sums[17]=gas[at+2u];sums[18]=gas[at+8u];sums[19]=gas[at+15u];sums[20]=gas[at+9u];sums[21]=gas[at];sums[22]=sums[0];break;
      }
    }
  }
}`});
  const info=await shader.getCompilationInfo(),errors=info.messages.filter(m=>m.type==='error');
  if(errors.length)throw Error(errors.map(m=>m.message).join('\n'));
  const layout=device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.COMPUTE,buffer:{type:'read-only-storage'}},
    {binding:1,visibility:GPUShaderStage.COMPUTE,buffer:{type:'storage'}}]});
  const pipeline=device.createComputePipeline({layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),compute:{module:shader,entryPoint:'observe'}});
  const group=device.createBindGroup({layout,entries:[{binding:0,resource:{buffer:model.buffers.gas}},{binding:1,resource:{buffer:budget}}]});
  const original=model.encode;
  function wrapped(encoder){const result=original.apply(model,arguments);
    if(model.enabled){const pass=encoder.beginComputePass({label:'gasBudget.observe'});pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();}return result;}
  model.encode=wrapped;
  return {
    async capture(){const read=device.createBuffer({size:128,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      try{const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(budget,0,read,0,128);queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
        const words=Array.from(new Uint32Array(read.getMappedRange())),total=at=>(words[at]+words[at+1]*4294967296)/scale;
        const initial=words[13]/scale,final=words[14]/scale,captured=total(1),vented=total(3),unassigned=total(5);
        return {definition:'Read-only accumulation of the native gas ledger after every pressure encode, including native substeps. Amount units are gas volume at room pressure. Captured, vented and unassigned amounts use exact unsigned 64-bit fixed-point sums. This accounts for model gas and does not validate the modeled water/air boundary.',
          pressureSteps:words[0],volumeScale:scale,initialAmount:initial,finalAmount:final,capturedAmount:captured,ventedAmount:vented,unassignedAmount:unassigned,
          closureError:initial+captured-vented-unassigned-final,maximumStepBalanceError:words[7]/scale,
          maximumConnectivityErrors:words[8],maximumOverflowErrors:words[9],maximumNonpositiveVolumes:words[10],firstNonpositive:words[15]?{root:words[16],amount:words[17]/scale,integrated:words[18]/scale,delta:new Int32Array(new Uint32Array([words[19]]).buffer)[0]/scale,vapor:words[20],geometry:words[21]/scale,step:words[22]}:null,rawWords:words};
      }finally{read.unmap();read.destroy();}},
    async close(){if(model.encode===wrapped)model.encode=original;await queue.onSubmittedWorkDone();budget.destroy();}
  };
}
