// Browser-side, read-only copies from one completed native update.
// Serialize installNativePairedObserver into a paused, real __toy page.
export function installNativePairedObserver() {
  const T=window.__toy,L=T.liquid(),model=T.airModel(),device=L.device;
  if(!T.stats().paused||!model?.enabled)throw Error('Paired observer requires a paused active real model');
  const originalEncode=model.encode,originalCreate=device.createCommandEncoder;
  let active=null,closed=false,serial=0;
  const maximumBytes=512*1024*1024;
  function copy(encoder,key,buffer,offset,size){
    if(!active)return;
    if(!(size>0)||size%4)throw Error('Invalid observer copy size '+key);
    if(!(buffer.usage&GPUBufferUsage.COPY_SRC))throw Error('Source is not copy-readable '+key);
    let record=active.buffers.get(key);
    if(record&&record.size!==size)throw Error('Observer source shape changed within one native frame: '+key);
    if(!record){
      if(active.bytes+size>maximumBytes)throw Error('Observer exceeds declared memory bound');
      record={size,buffer:device.createBuffer({label:'water.machine.observer.'+key,size,
        usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST})};
      active.buffers.set(key,record);active.bytes+=size;
    }
    encoder.copyBufferToBuffer(buffer,offset,record.buffer,0,size);
  }
  function fine(encoder,prefix,instance){
    const n=instance.grid.cells;
    for(const name of ['cellMass','cellVX','cellVY','cellVelX','cellVelY'])
      copy(encoder,prefix+name,instance.buf[name],0,n*4);
  }
  function residents(encoder,prefix,instance){
    for(const name of ['pos','affine','aux','flag'])copy(encoder,prefix+name,instance.buf[name],0,instance.uploadedCount*(name==='flag'?4:16));
  }
  const observedEncode=model.encode=function(encoder,instance,slot){
    if(active){
      active.substeps++;active.lastSlot=slot;active.instance=instance;
      active.grid={...instance.grid,cellSize:instance.cellSize,stepDt:instance.stepDt};
      active.simulationParams=Array.from(instance.simParamsHost);
      active.gridParams=Array.from(instance.paramsHost || []);
      active.directParams=Object.fromEntries(['GRAVITY','TIMESCALE','MAX_VEL','BURST_DAMP','AIR_DRAG'].map(name=>[name,
        typeof instance.getSimParam==='function' ? instance.getSimParam(name) ?? null : null]));
      fine(encoder,'pre-',instance);
      residents(encoder,'pre-resident-',instance);
      copy(encoder,'pre-geometry',model.buffers.geometry,0,model.width*model.height*model.geometryStride*4);
    }
    const result=originalEncode.apply(this,arguments);
    if(active){
      fine(encoder,'projected-',instance);
      for(const [name,buffer] of Object.entries(model.buffers)){
        if(name==='phase'||!buffer)continue; // phase shares gas storage in the current ABI
        copy(encoder,'model-'+name,buffer,0,buffer.size);
      }
      if(model.phaseOffset!==undefined)copy(encoder,'model-phase',model.buffers.gas,model.phaseOffset,model.width*model.height*16);
    }
    return result;
  };
  const observedCreate=device.createCommandEncoder=function(descriptor){
    const encoder=originalCreate.apply(this,arguments);
    if(descriptor?.label==='liquid.frame'){
      const begin=encoder.beginComputePass;
      if(begin)encoder.beginComputePass=function(passDescriptor){
        const pass=begin.apply(this,arguments);
        if(passDescriptor?.label==='liquid.grid2.afterAir'){
          const end=pass.end;pass.end=function(){const result=end.apply(this,arguments);
            if(active?.instance)fine(encoder,'after-boundary-',active.instance);return result;};
        }
        if(passDescriptor?.label==='liquid.g2p'){
          const end=pass.end;pass.end=function(){const result=end.apply(this,arguments);
            if(active?.instance){residents(encoder,'after-gather-resident-',active.instance);active.gatherResidentCopied=true;}return result;};
        }
        return pass;
      };
      const finish=encoder.finish;
      encoder.finish=function(){
        if(active&&active.instance){
          residents(encoder,'post-resident-',L);
          active.postResidentCopied=true;
        }
        return finish.apply(this,arguments);
      };
    }
    return encoder;
  };
  function destroy(sample){for(const r of sample.buffers.values())r.buffer.destroy();sample.buffers.clear();}
  async function step(dt){
    if(closed||active)throw Error('Observer closed or already reading');
    if(!T.stats().paused)throw Error('RAF must remain paused');
    const sample=active={serial:++serial,substeps:0,buffers:new Map(),bytes:0,startClock:L.simulationClock,
      startSteps:T.airStats().steps,count:L.liquid.getCount(),wallStart:performance.now(),inputCalls:0};
    try{
      while(!sample.postResidentCopied&&sample.inputCalls<8){
        L.update(dt);sample.inputCalls++;
        if(!L.simActive&&L.simActive!==undefined)throw Error('Native solver stopped during observer update');
        if(sample.substeps&&!sample.postResidentCopied)throw Error('Model encoded without a complete native frame');
      }
      sample.endClock=L.simulationClock;sample.endSteps=T.airStats().steps;
      if(!sample.postResidentCopied||sample.endSteps-sample.startSteps!==sample.substeps)throw Error('No complete model-native frame observed');
      const raw={};
      const maps=await Promise.allSettled([...sample.buffers].map(async([key,record])=>{
        try{await record.buffer.mapAsync(GPUMapMode.READ);raw[key]=record.buffer.getMappedRange().slice(0);}
        finally{try{record.buffer.unmap();}catch{}}
      }));
      const failedMap=maps.find(r=>r.status==='rejected');if(failedMap)throw failedMap.reason;
      let snapshot;
      for(let tries=0;tries<100;tries++){
        snapshot=await model.capture();
        if(snapshot?.steps===sample.endSteps)break;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      if(snapshot?.steps!==sample.endSteps||L.simulationClock!==sample.endClock||T.airStats().steps!==sample.endSteps)
        throw Error('Fresh pressure snapshot does not belong to the copied update');
      for(const [name,view] of Object.entries({cells:snapshot.cells,labels:snapshot.labels,history:snapshot.history,
        geometry:snapshot.geometry,gas:snapshot.gas,phase:snapshot.phase,pressure:snapshot.pressure,mac:snapshot.mac})){
        if(view)raw['fresh-'+name]=view.buffer.slice(view.byteOffset,view.byteOffset+view.byteLength);
      }
      const freshMatchesCopied={};
      for(const name of ['cells','labels','history','geometry','gas','phase','mac']){
        if(!raw['fresh-'+name]||!raw['model-'+name])continue;
        const fresh=new Uint8Array(raw['fresh-'+name]),copied=new Uint8Array(raw['model-'+name]);
        freshMatchesCopied[name]=fresh.length<=copied.length&&fresh.every((v,i)=>v===copied[i]);
        if(!freshMatchesCopied[name])throw Error('Fresh '+name+' differs from the same-frame copy');
      }
      function material(prefix){
        if(!raw[prefix+'aux']||!raw[prefix+'pos']||!raw[prefix+'flag'])return null;
        const pos=new Float32Array(raw[prefix+'pos']),aux=new Float32Array(raw[prefix+'aux']),flags=new Uint32Array(raw[prefix+'flag']);
        const rho=model.settings.density,c=model.settings.soundSpeed,K=rho*c*c,V0=1.5625,
          gravity=sample.directParams.GRAVITY ?? sample.simulationParams[0];
        let waterCount=0,invalidDensity=0,minimumJ=Infinity,maximumJ=-Infinity,volume=0,compression=0,kinetic=0,potential=0;
        for(let i=0;i<flags.length;i++){
          if(((flags[i]&3)|((flags[i]>>4)&4))!==0)continue;waterCount++;
          kinetic+=.5*rho*V0*(pos[i*4+2]**2+pos[i*4+3]**2);potential-=rho*V0*gravity*pos[i*4+1];
          const density=aux[i*4];if(!(density>0&&Number.isFinite(density))){invalidDensity++;continue;}
          const J=4/density,delta=J-1;minimumJ=Math.min(minimumJ,J);maximumJ=Math.max(maximumJ,J);
          volume+=V0*J;compression+=K*V0*(delta-Math.log1p(delta));
        }
        const active=model.settings.constitutiveLaw==='density-linear';
        return {intrinsicInterpretationValid:active,waterCount,invalidDensity,minimumJ:waterCount?minimumJ:null,maximumJ:waterCount?maximumJ:null,
          materialArea:active&&!invalidDensity?volume:null,compressionEnergy:active&&!invalidDensity?compression:null,
          kinetic,potential,total:active&&!invalidDensity?kinetic+potential+compression:null,gravity,
          definition:'Water-only aux.x=4/J; rest area1.5625; fixed mass rho0*rest area; compression sum K*V0*(J-1-log(J)), K=rho0*c². Potential reference y=0 with downward-positive coordinates. Energy is invalid unless density-linear material is initialized.'};
      }
      const metadata={serial:sample.serial,requestedInputDt:dt,inputCalls:sample.inputCalls,count:sample.count,residentCount:L.uploadedCount,substeps:sample.substeps,lastSlot:sample.lastSlot,
        startClock:sample.startClock,endClock:sample.endClock,startSteps:sample.startSteps,endSteps:sample.endSteps,
        grid:sample.grid,simulationParams:sample.simulationParams,gridParams:sample.gridParams,directParams:sample.directParams,
        pressureGrid:{width:model.width,height:model.height,cellSize:model.cellSize,geometryStride:model.geometryStride,
          cellStride:snapshot.cellStride || 8,phaseStride:snapshot.phaseStride || 4,phaseOffset:model.phaseOffset,settings:model.settings,
          macStride:snapshot.macStride ?? model.macStride ?? 0,macFaceRecords:model.macFaceRecords ?? 0,macRecords:model.macRecords ?? 0},
        convergence:snapshot.convergence,ledger:snapshot.ledger,phaseLedger:snapshot.phaseLedger,pockets:snapshot.pockets,
        macDiagnostics:snapshot.macDiagnostics ?? null,
        material:{pre:material('pre-resident-'),afterGather:material('after-gather-resident-'),post:material('post-resident-')},
        nativeGatherCaptured:!!sample.gatherResidentCopied,
        freshMatchesCopied,
        elapsedWallMs:performance.now()-sample.wallStart,
        ordering:'Native last-substep pre-model fine P2G diagnostics and residents; post-model projected fine diagnostics and all exposed model buffers including actual MAC records; fine diagnostics after native boundary pass when used; resident state after actual native gather and again after collision before frame finish. Fresh fields are copied with the native clock held and exact solver step identity. Legacy fine mass does not define the MAC physical operator.',
        limitation:'This controlled mode invokes native liquid.update with the real host paused. Static no-guest apparatus only. It does not run host animation, guest motion or automatic valve callbacks. Multi-substep updates retain the last substep and report the number, rather than asserting the first failed substep.'};
      return {metadata,raw};
    }finally{destroy(sample);active=null;}
  }
  function close(){
    if(active)throw Error('Cannot close an in-flight observer');
    if(closed)return;closed=true;
    if(model.encode===observedEncode)model.encode=originalEncode;
    if(device.createCommandEncoder===observedCreate)device.createCommandEncoder=originalCreate;
  }
  return {step,close};
}

export function serializePairedCapture(capture) {
  const records={};
  for(const [key,bytes] of Object.entries(capture.raw)){
    const data=new Uint8Array(bytes);let binary='';
    for(let i=0;i<data.length;i+=16384)binary+=String.fromCharCode(...data.subarray(i,i+16384));
    records[key]=btoa(binary);
  }
  return {metadata:capture.metadata,records,recordLengths:Object.fromEntries(Object.entries(records).map(([key,s])=>[key,s.length]))};
}
