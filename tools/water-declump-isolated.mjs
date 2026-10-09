// Browser-side positional-pass oracle. No pressure, collision or G2P runs here.
// Called by DECLUMP_ISOLATED=1 tools/test-water-air-view.mjs on an owned device.
export async function checkIsolatedDeclump(){
  const L=__toy.liquid(),device=L.device,capacity=1100,cell=L.cellSize,width=64,cells=width*width;
  const check=(value,message)=>{if(!value)throw new Error(message);};
  check(window.__ownedNativeAPI,'Test-only native export exists');
  L.setSimParam('DECLUMP_JACOBI',1);check(L.getSimParam('DECLUMP_JACOBI')===1,'Snapshot mode supported');
  device.pushErrorScope('validation');
  const fixtures=[
    {name:'compressed-cloud',count:129,density:7,pitch:.27},
    {name:'exact-coincident-dense',count:1024,density:7,pitch:0},
    {name:'exact-coincident-below-gate',count:259,density:4,pitch:0},
    {name:'below-gate-noncoincident',count:129,density:4,pitch:.27,unchanged:true},
    {name:'wall-cloud',count:129,density:7,pitch:.12,terrain:'wall'},
    {name:'floor-cloud',count:129,density:7,pitch:.12,terrain:'floor'},
    {name:'corner-cloud',count:129,density:7,pitch:.12,terrain:'corner'}
  ];
  const rows=[];
  const read=async(buffer,size)=>{
    device.pushErrorScope('validation');
    const copy=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const encoder=device.createCommandEncoder();encoder.copyBufferToBuffer(buffer,0,copy,0,size);L.queue.submit([encoder.finish()]);
    try{const error=await device.popErrorScope();check(!error,'Readback validation: '+error?.message);
      await copy.mapAsync(GPUMapMode.READ);return copy.getMappedRange().slice(0);
    }finally{copy.unmap();copy.destroy();}
  };
  const equal=(a,b)=>a.byteLength===b.byteLength&&new Uint8Array(a).every((v,i)=>v===new Uint8Array(b)[i]);
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  for(const fixture of fixtures){
    let reference=null;
    for(const mode of ['standalone','shared-encoder'])for(const reverse of [false,true]){
      const pos=new Float32Array(capacity*4),aux=new Float32Array(capacity*4),flag=new Uint32Array(capacity);
      for(let i=0;i<capacity;i++){
        pos.set([64,64,17.25,-29.5],i*4);aux.set([fixture.density,.375,64,64],i*4);flag[i]=8;
      }
      const side=Math.ceil(Math.sqrt(fixture.count));
      for(let i=0;i<fixture.count;i++){
        const x=(i%side-(side-1)/2)*fixture.pitch,y=(Math.floor(i/side)-(side-1)/2)*fixture.pitch;
        pos[i*4]=(fixture.terrain==='wall'||fixture.terrain==='corner'?125.5:64)+x;
        pos[i*4+1]=(fixture.terrain==='floor'||fixture.terrain==='corner'?125.5:64)+y;
      }
      const count=fixture.count+2;
      pos.set([96,96,3,-5],fixture.count*4);flag[fixture.count]=8|32;
      pos.set([96,96,3,-5],(fixture.count+1)*4);flag[fixture.count+1]=65|8;
      const original=pos.buffer.slice(0);L.uploadedCount=count;
      L.queue.writeBuffer(L.buf.aux,0,aux);L.queue.writeBuffer(L.buf.flag,0,flag);
      const cfg=new Uint32Array(L.paramsHost.length),floats=new Float32Array(cfg.buffer);
      cfg[0]=count;cfg[1]=width;cfg[2]=width;cfg[5]=cells;
      floats[6]=1/120;floats[7]=1/cell;floats[8]=32;floats[9]=8;floats[10]=32;
      cfg[14]=32;cfg[15]=32;floats.set([0,0,width*cell,width*cell],16);
      L.queue.writeBuffer(L.paramsBuf,0,cfg);
      const terrain=new Uint32Array(32);
      for(let r=0;r<32;r++)for(let c=0;c<32;c++){
        const solid=(fixture.terrain==='wall'||fixture.terrain==='corner')&&c>=16 ||
          (fixture.terrain==='floor'||fixture.terrain==='corner')&&r>=16;
        if(solid){const index=r*32+c;terrain[index>>5]|=1<<(index&31);}
      }
      L.queue.writeBuffer(L.buf.terrainMask,0,terrain);
      let points=new Float32Array(original),maximumMove=0,canonicalChecks=0;
      for(let iteration=0;iteration<8;iteration++){
        const buckets=Array.from({length:cells},()=>[]),of=new Uint32Array(count);
        for(let i=0;i<count;i++){
          const c=Math.max(0,Math.min(width-1,Math.floor(points[i*4]/cell)));
          const r=Math.max(0,Math.min(width-1,Math.floor(points[i*4+1]/cell)));
          of[i]=r*width+c;buckets[of[i]].push(i);
        }
        const counts=new Uint32Array(cells),starts=new Uint32Array(cells),sorted=new Uint32Array(count),expected=new Uint32Array(count);
        let cursor=0;
        for(let c=0;c<cells;c++){
          counts[c]=buckets[c].length;starts[c]=cursor;expected.set(buckets[c],cursor);
          sorted.set(reverse?buckets[c].slice().reverse():buckets[c],cursor);cursor+=counts[c];
        }
        L.queue.writeBuffer(L.buf.cellOf,0,of);L.queue.writeBuffer(L.buf.cellCount,0,counts);
        L.queue.writeBuffer(L.buf.cellStart,0,starts);L.queue.writeBuffer(L.buf.sortedIdx,0,sorted);
        let input;
        if(mode==='shared-encoder'){
          // The snapshot must observe this preceding, unsubmitted GPU copy.
          input=device.createBuffer({size:points.byteLength,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
          L.queue.writeBuffer(input,0,points);L.frameEncoder=device.createCommandEncoder();
          L.frameEncoder.copyBufferToBuffer(input,0,L.buf.pos,0,points.byteLength);
        }else L.queue.writeBuffer(L.buf.pos,0,points);
        try{__ownedNativeAPI.runDeclump(L);if(L.frameEncoder)L.queue.submit([L.frameEncoder.finish()]);}
        finally{L.frameEncoder=null;}
        const output=await read(L.buf.pos,points.byteLength),next=new Float32Array(output);
        input?.destroy();
        for(let i=0;i<capacity;i++)for(let lane=0;lane<4;lane++){
          const index=i*4+lane;check(Number.isFinite(next[index]),fixture.name+' finite output');
          if(lane>=2||i>=fixture.count||fixture.unchanged)
            check(new Uint32Array(output)[index]===new Uint32Array(original)[index],fixture.name+' preserved control, velocity and tail');
          else{const delta=Math.abs(next[index]-points[index]);check(delta<=cell+1e-5,'Per-axis displacement cap');maximumMove=Math.max(maximumMove,delta);}
        }
        for(let i=0;i<count;i++){
          check(!(fixture.terrain==='wall'||fixture.terrain==='corner')||next[i*4]<128,'Outside wall');
          check(!(fixture.terrain==='floor'||fixture.terrain==='corner')||next[i*4+1]<128,'Above floor');
        }
        check(equal(await read(L.buf.declumpCanonical,count*4),expected.buffer),'Canonical IDs exactly match independent ascending-ID oracle');
        canonicalChecks++;points=next;
      }
      check(equal(await read(L.buf.aux,aux.byteLength),aux.buffer),'Auxiliary state unchanged');
      check(equal(await read(L.buf.flag,flag.byteLength),flag.buffer),'Material flags unchanged');
      if(fixture.unchanged)check(maximumMove===0,'Below-gate noncoincident particles stay fixed');
      else check(maximumMove>0,'Recovery separates dense or coincident particles');
      const stacks=new Map();let largestStack=0;
      for(let i=0;i<fixture.count;i++){
        const key=points[i*4]+','+points[i*4+1],n=(stacks.get(key)||0)+1;stacks.set(key,n);largestStack=Math.max(largestStack,n);
      }
      if(fixture.pitch===0)check(largestStack<fixture.count,'Coincident knot releases');
      if(reference)check(equal(points.buffer,reference),'Permutation and encoder mode give identical output');
      else reference=points.buffer.slice(0);
      rows.push({fixture:fixture.name,count,mode,reverse,iterations:8,canonicalChecks,maximumMove,largestStack,sha256:await digest(points.buffer)});
    }
  }
  const validation=await device.popErrorScope();check(!validation,validation?.message);
  return {pass:true,rows,validation:null,
    scope:'Native positional recovery only: fixed neighbor lists, exact coincidence, terrain clamps, velocity/material/tail preservation and encoder ordering. It does not certify machine flow or frame rate.'};
}
