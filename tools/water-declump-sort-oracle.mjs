// Canonical neighbor ordering against the actual native dense/sparse builders.
// Frozen controls isolate sorting from pressure, transport and recovery motion.
export async function checkNativeDeclumpOrdering(){
  const L=__toy.liquid(),device=L.device,cell=L.cellSize,width=128,cells=width*width,rows=[];
  const check=(value,message)=>{if(!value)throw new Error(message);};
  check(typeof L.prepareDeclumpJacobi==='function','Asynchronous preparation API');
  L.setSimParam('DECLUMP_JACOBI',1);check(await L.prepareDeclumpJacobi(),'Validated snapshot pipeline ready');
  check(L.declumpJacobiState==='ready' && !L.declumpJacobiError,'Ready state published');
  const read=async(buffer,size)=>{
    if(size===0)return new ArrayBuffer(0);
    const copy=device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const enc=device.createCommandEncoder();enc.copyBufferToBuffer(buffer,0,copy,0,size);L.queue.submit([enc.finish()]);
    try{await copy.mapAsync(GPUMapMode.READ);return copy.getMappedRange().slice(0);}finally{copy.unmap();copy.destroy();}
  };
  const equal=(a,b)=>a.byteLength===b.byteLength&&new Uint8Array(a).every((v,i)=>v===new Uint8Array(b)[i]);
  // Order forces repeated changes in count, parity, origins and culling.
  const sizes=[0,1,1023,1024,1025,2047,2048,2049,3073,40000,1,2049,1024];
  device.pushErrorScope('validation');
  for(const sparse of [false,true])for(const shape of ['many-cells','coincident','culled','all-culled'])for(const count of sizes){
    const originX=sparse?-48:23,originY=sparse?-37:17;
    const region=[(originX+8)*cell,(originY+8)*cell,(originX+110)*cell,(originY+110)*cell];
    const pos=new Float32Array(Math.max(1,count)*4),aux=new Float32Array(Math.max(1,count)*4),flag=new Uint32Array(Math.max(1,count));
    for(let i=0;i<count;i++){
      let x=(originX+20+(i*17)%83)*cell+.125,y=(originY+20+(i*31)%83)*cell+.25;
      if(shape==='coincident'){x=(originX+64)*cell;y=(originY+64)*cell;}
      if(shape==='culled'){
        // Four exact boundaries are active. Later outliers leave stale IDs.
        if(i%8===0)x=region[0];else if(i%8===1)y=region[1];else if(i%8===2)x=region[2];
        else if(i%8===3)y=region[3];else if(i%8===4)x=region[0]-.25;else if(i%8===5)y=region[3]+.25;
      }
      if(shape==='all-culled')x=region[0]-.25;
      pos.set([x,y,17.25,-29.5],i*4);aux.set([4,.375,x,y],i*4);flag[i]=8|32;
    }
    const cfg=new Uint32Array(L.paramsHost.length),floats=new Float32Array(cfg.buffer);
    cfg[0]=count;cfg[1]=width;cfg[2]=width;cfg[3]=originX>>>0;cfg[4]=originY>>>0;cfg[5]=cells;
    floats[6]=1/120;floats[7]=1/cell;floats[8]=512;floats[9]=8;floats[10]=512;
    cfg[14]=32;cfg[15]=32;floats.set(region,16);
    L.uploadedCount=count;L.grid={w:width,h:width,cells,originX,originY};L.sparseVeto=!sparse;
    if(sparse)check(L.sparseGridOK && L.sparseP2GOK && L.sparseGrid2OK,'Actual sparse builder available');
    L.queue.writeBuffer(L.paramsBuf,0,cfg);L.queue.writeBuffer(L.buf.pos,0,pos);
    L.queue.writeBuffer(L.buf.aux,0,aux);L.queue.writeBuffer(L.buf.flag,0,flag);
    L.queue.writeBuffer(L.buf.cellCount,0,new Uint32Array(cells));
    // A dirty tail of valid, in-region IDs must not survive as live entries.
    L.queue.writeBuffer(L.buf.sortedIdx,0,new Uint32Array(Math.max(1,count)).fill(Math.max(0,count-1)));
    L.queue.writeBuffer(L.buf.cellOf,0,new Uint32Array(Math.max(1,count)).fill(123));
    __ownedNativeAPI.buildGrid(L);
    const sortedBefore=await read(L.buf.sortedIdx,count*4),counts=new Uint32Array(await read(L.buf.cellCount,cells*4));
    const starts=new Uint32Array(await read(L.buf.cellStart,cells*4)),buckets=Array.from({length:cells},()=>[]);
    for(let i=0;i<count;i++){
      const x=pos[i*4],y=pos[i*4+1];if(x<region[0]||y<region[1]||x>region[2]||y>region[3])continue;
      const c=Math.max(0,Math.min(width-1,Math.floor(x/cell)-originX));
      const r=Math.max(0,Math.min(width-1,Math.floor(y/cell)-originY));buckets[r*width+c].push(i);
    }
    const expected=new Uint32Array(count*2).fill(0xffffffff),occupied=new Uint8Array(count);let active=0,nonRowMajor=false,previous=-1;
    for(let c=0;c<cells;c++){
      check(counts[c]===buckets[c].length,'Native membership agrees with independent cull/flat-cell oracle');
      if(!counts[c])continue;const st=starts[c];if(st<previous)nonRowMajor=true;previous=st;
      check(st+counts[c]<=count,'Native segment bounds');
      buckets[c].forEach((id,k)=>{check(!occupied[st+k],'Native segments do not overlap');occupied[st+k]=1;
        expected.set([st,id],(st+k)*2);active++;});
    }
    check(occupied.slice(0,active).every(v=>v===1)&&occupied.slice(active).every(v=>v===0),'Native segments partition the active prefix');
    // Shared encoder starts with an unsubmitted copy, exercising same-encoder visibility.
    const input=device.createBuffer({size:pos.byteLength,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
    L.queue.writeBuffer(input,0,pos);L.frameEncoder=device.createCommandEncoder();
    L.frameEncoder.copyBufferToBuffer(input,0,L.buf.pos,0,pos.byteLength);
    try{__ownedNativeAPI.runDeclump(L);L.queue.submit([L.frameEncoder.finish()]);}finally{L.frameEncoder=null;}
    if(count)check(equal(await read(L.declumpCanonicalPairs,count*8),expected.buffer),'Exact canonical (native segment start, particle ID) pairs');
    check(equal(await read(L.buf.sortedIdx,count*4),sortedBefore),'Original atomic scatter list unchanged');
    check(equal(await read(L.buf.pos,pos.byteLength),pos.buffer),'Frozen positions and velocities unchanged');
    check(equal(await read(L.buf.aux,aux.byteLength),aux.buffer),'Auxiliary words unchanged');
    check(equal(await read(L.buf.flag,flag.byteLength),flag.buffer),'Material words unchanged');
    input.destroy();rows.push({sparse,shape,count,active,originX,originY,nonRowMajor,mergePasses:Math.max(0,Math.ceil(Math.log2(Math.max(1,count)/1024))),pass:true});
  }
  const validation=await device.popErrorScope();check(!validation,validation?.message);
  check(rows.some(r=>r.sparse&&r.nonRowMajor),'Sparse fixture exercised non-row-major segment offsets');
  return {pass:true,rows,validation:null,scope:'Canonical ordering only with actual native dense/sparse builders, negative/nonzero origins, inclusive cull edges, stale IDs, changing counts and merge parity. No physical or frame-rate acceptance.'};
}
