// Test-only asynchronous timestamps. Inject before the game requests a device.
// Every 24th encoder of each label is sampled; no queue drain or gl.finish.
export function installGPUAudit(){
  window.__gpuAudit={supported:false,rows:[],errors:[]};
  if(!window.GPUAdapter)return;
  const request=GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice=async function(desc={}){
    const supported=this.features.has('timestamp-query');
    if(supported)desc={...desc,requiredFeatures:[...new Set([...(desc.requiredFeatures||[]),'timestamp-query'])]};
    const device=await request.call(this,desc);
    if(!supported)return device;
    __gpuAudit.supported=true;
    const create=device.createCommandEncoder.bind(device),submit=device.queue.submit.bind(device.queue);
    const commands=new WeakMap(),counts=new Map();
    device.createCommandEncoder=function(desc={}){
      const enc=create(desc),label=desc.label||'unlabelled',n=(counts.get(label)||0)+1;counts.set(label,n);
      if(!window.__auditRecording||n%24)return enc;
      const query=device.createQuerySet({type:'timestamp',count:1024}),names=[];
      const resolve=device.createBuffer({size:8192,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});
      const read=device.createBuffer({size:8192,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      for(const method of ['beginComputePass','beginRenderPass']){
        const begin=enc[method].bind(enc);
        enc[method]=function(d={}){
          if(names.length>=512)return begin(d);
          const index=names.length*2;names.push(d.label||method);
          return begin({...d,timestampWrites:{querySet:query,beginningOfPassWriteIndex:index,endOfPassWriteIndex:index+1}});
        };
      }
      const finish=enc.finish.bind(enc);
      enc.finish=function(d){
        if(names.length){enc.resolveQuerySet(query,0,names.length*2,resolve,0);enc.copyBufferToBuffer(resolve,0,read,0,names.length*16);}
        const buffer=finish(d);
        commands.set(buffer,{query,resolve,read,names,label});return buffer;
      };
      return enc;
    };
    device.queue.submit=function(buffers){
      const list=[...buffers],result=submit(list);
      for(const buffer of list){const q=commands.get(buffer);if(!q)continue;commands.delete(buffer);
        const dispose=()=>{q.query.destroy();q.resolve.destroy();q.read.destroy();};
        if(!q.names.length){dispose();continue;}
        q.read.mapAsync(GPUMapMode.READ).then(()=>{
          const times=new BigUint64Array(q.read.getMappedRange()),passes=[];
          for(let i=0;i<q.names.length;i++)passes.push({name:q.names[i],ms:Number(times[i*2+1]-times[i*2])/1e6});
          if(window.__auditRecording)__gpuAudit.rows.push({name:q.label,ms:passes.reduce((s,p)=>s+p.ms,0),passes});
          q.read.unmap();dispose();
        }).catch(e=>{__gpuAudit.errors.push(String(e));dispose();});
      }
      return result;
    };
    return device;
  };
}
