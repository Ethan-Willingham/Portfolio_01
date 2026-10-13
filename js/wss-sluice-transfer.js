/* Read the wet contents of a receiver before an explicit user transfer.
   The caller stops the solver and inputs, applies pending native operations,
   and owns the external inventory. This helper never edits GPU or CPU rows. */
(function(root){
'use strict';
function selectionRect(rect){
 if(!rect || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite) || rect.width<=0 || rect.height<=0 || !Number.isFinite(rect.x+rect.width) || !Number.isFinite(rect.y+rect.height))throw Error('The receiver needs a finite, positive rectangle.');
 return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
}
function material(flag){
 var type=(flag&3)|((flag>>>4)&4),origin=(flag>>>2)&3;
 if(type===0)return 'water';
 if(type===5)return origin===3?'gold':origin===2?'blackSand':'sand';
 throw Error('The receiver contains an unsupported material.');
}
async function capture(instance,rect){
 var area=selectionRect(rect);
 if(!instance || !instance.device || !instance.queue || !instance.buf || !instance.buf.pos || !instance.buf.flag || !instance.simActive)throw Error('The native sluice inventory is unavailable.');
 var count=instance.uploadedCount,clock=instance.simulationClock,liquid=instance.liquid;
 var mutationSeq=liquid && typeof liquid.getMutationSeq==='function'?liquid.getMutationSeq():null;
 if(!Number.isSafeInteger(count) || count<0 || count>instance.maxParticles || !Number.isFinite(clock))throw Error('The resident sluice inventory is invalid.');
 function unchanged(){
  if(instance.uploadedCount!==count || instance.simulationClock!==clock ||
   liquid && typeof liquid.getCount==='function' && liquid.getCount()!==count ||
   mutationSeq!==null && liquid.getMutationSeq()!==mutationSeq)throw Error('The sluice changed while reading the receiver. Stop its inputs and solver before transferring.');
 }
 unchanged();
 var result={count:count,clock:clock,mutationSeq:mutationSeq,rect:area,selectedCount:0,
  indices:[],counts:{water:0,sand:0,blackSand:0,gold:0},records:[]};
 result.materials=result.counts;result.positions=new Float32Array(0);result.flags=new Uint32Array(0);
 if(!count)return result;
 var readback=instance.device.createBuffer({label:'sluice.receiver.snapshot',size:count*20,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
 try{
  var encoder=instance.device.createCommandEncoder({label:'sluice.receiver.snapshot'});
  encoder.copyBufferToBuffer(instance.buf.pos,0,readback,0,count*16);
  encoder.copyBufferToBuffer(instance.buf.flag,0,readback,count*16,count*4);
  instance.queue.submit([encoder.finish()]);
  await readback.mapAsync(GPUMapMode.READ);
  unchanged();
  var bytes=readback.getMappedRange(),positions=new Float32Array(bytes,0,count*4),flags=new Uint32Array(bytes,count*16,count);
  // Return owned copies, not views into a staging buffer that is destroyed.
  // The host may refresh its mirror before replaying descending REMOVE ops.
  result.positions=positions.slice();result.flags=flags.slice();
  for(var i=0;i<count;i++){
   var x=positions[i*4],y=positions[i*4+1],vx=positions[i*4+2],vy=positions[i*4+3];
   if(![x,y,vx,vy].every(Number.isFinite))throw Error('The native sluice inventory contains a nonfinite particle.');
   if(x<area.x || x>area.x+area.width || y<area.y || y>area.y+area.height)continue;
   var kind=material(flags[i]);result.indices.push(i);result.counts[kind]++;
   result.records.push({index:i,x:x,y:y,vx:vx,vy:vy,flag:flags[i],material:kind});
  }
  result.selectedCount=result.indices.length;
  return result;
 }finally{readback.destroy();}
}
root.WSSSluiceTransfer={capture:capture};
})(typeof window!=='undefined'?window:globalThis);
