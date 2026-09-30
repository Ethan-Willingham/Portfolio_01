// Private test instrumentation. Production shader calculations stay unchanged.
import assert from 'node:assert/strict';

export function profileSnowWorkload(source) {
  function replaceOnce(from, to) {
    assert.equal(source.split(from).length, 2, 'Unique snow profiler anchor');
    source = source.replace(from, to);
  }
  replaceOnce("      if(grainPass&&instance.snowTrackContactMotion){\n        cp.setPipeline(instance.snowGrainPipe.trackMotion);",
    "      if(grainPass&&instance.snowTrackContactMotion){\n        cp.end();\n        cp=enc.beginComputePass({label:'snow.motionAfterContact'});\n        cp.setPipeline(instance.snowGrainPipe.trackMotion);");
  replaceOnce("    instance.snowTrackContactMotion=kind!=='predict';",
    "    instance.snowTrackContactMotion=kind!=='predict';\n    instance.snowProfileKind=kind;");
  replaceOnce("    var frameEncoder = instance.device.createCommandEncoder({ label: 'liquid.frame' });", `
    var snowProfileNow=performance.now();
    var snowProfileSample=hasSnow&&window.__sluicePerformance&&
      window.__sluicePerformance.frameId!==null&&!instance.snowProfilePending&&
      (instance.snowProfileAt===undefined||snowProfileNow-instance.snowProfileAt>=1000);
    instance.snowProfileSlots=null;
    if(snowProfileSample){
      instance.snowProfileAt=snowProfileNow;
      if(!instance.snowProfileRead)instance.snowProfileRead=instance.device.createBuffer({
        label:'snow.workloadRead',size:1024,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      instance.snowProfileSlots=[];
    }
    var frameEncoder = instance.device.createCommandEncoder({ label: 'liquid.frame' });`);
  replaceOnce("    liquidSubmit(instance, enc);\n  }\n\n  // v24.185", `
    if(snowOnly&&instance.snowProfileSlots&&instance.snowProfileSlots.length<128){
      var snowProfileOffset=instance.snowProfileSlots.length*8;
      instance.snowProfileSlots.push({kind:instance.snowProfileKind,slot:substepSlot|0});
      enc.copyBufferToBuffer(instance.buf.snowGuestCount,0,instance.snowProfileRead,snowProfileOffset,4);
      enc.copyBufferToBuffer(instance.buf.snowFallbackCount,0,instance.snowProfileRead,snowProfileOffset+4,4);
    }
    liquidSubmit(instance, enc);
  }

  // v24.185`);
  replaceOnce("      instance.queue.submit([frameEncoder.finish()]);\n      instance.simulationClock", `
      instance.queue.submit([frameEncoder.finish()]);
      if(snowProfileSample){
        instance.snowProfilePending=true;
        var snowProfileSlots=instance.snowProfileSlots;
        var snowProfileRow={atMs:snowProfileNow-(window.__ownerReplay?window.__ownerReplay.start():0),
          frameId:window.__sluicePerformance?window.__sluicePerformance.frameId:null,
          particles:count,subSteps:subSteps,grainSteps:grainSteps,queues:snowProfileSlots};
        instance.snowProfileRead.mapAsync(GPUMapMode.READ).then(function(){
          var values=new Uint32Array(instance.snowProfileRead.getMappedRange());
          snowProfileSlots.forEach(function(row,i){row.nearGuest=values[i*2];row.fallback=values[i*2+1];});
          instance.snowProfileRead.unmap();
          if(!window.__snowWorkloadRows)window.__snowWorkloadRows=[];
          window.__snowWorkloadRows.push(snowProfileRow);
        }).catch(function(e){console.error('Snow workload readback',e);})
          .finally(function(){instance.snowProfilePending=false;});
      }
      instance.simulationClock`);
  return source;
}
