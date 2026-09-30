#!/usr/bin/env node
// Actual GPU grid membership and exact snow contact comparison.
// DRY_RUN=1 checks source hooks without launching Chrome for Testing.
// BEFORE=/path/reference.js AFTER=/path/candidate.js BENCH=1 DUMP=/tmp/snow-neighbors
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.DUMP||'/tmp/sluice-snow-neighbors-gpu';
const port=Number(process.env.PORT||8298),debugPort=port+1000;
const sources={},metadata={};
const beforeRef='c92d501';
const contactWG=Number(process.env.CONTACT_WG||256);
assert([32,64,128,256].includes(contactWG),'CONTACT_WG must be32,64,128,256');
for(const name of ['before','after']){
  const filename=process.env[name.toUpperCase()]||(name==='after'?path.join(root,'js/liquid-wgpu.js'):null);
  let source=filename?fs.readFileSync(filename,'utf8'):execFileSync('git',['show',beforeRef+':js/liquid-wgpu.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
  const originalSHA=createHash('sha256').update(source).digest('hex');
  if(name==='after'&&contactWG!==256){
    for(const entry of ['contacts','shield','contactsSpatial','shieldSpatial'])source=source.replace('@compute @workgroup_size(256)\nfn '+entry+'(', '@compute @workgroup_size('+contactWG+')\nfn '+entry+'(');
    source=source.replace('pass.setPipeline(instance.snowGrainPipe[kind]);\n    pass.dispatchWorkgroups(Math.ceil(instance.uploadedCount/256));','pass.setPipeline(instance.snowGrainPipe[kind]);\n    pass.dispatchWorkgroups(Math.ceil(instance.uploadedCount/((kind===\'contacts\'||kind===\'shield\')?'+contactWG+':256)));');
    source=source.replace('pending / 256u + 1u','pending / '+contactWG+'u + 1u');
  }
  const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
  assert.equal(source.split(marker).length,2,'Source export anchor');
  sources[name]=source.replace(marker,marker+`\nwindow.__snowAPIs.${name}={buildBuffers:buildBuffers,buildGridPipelines:buildGridPipelines,buildP2GPipelines:buildP2GPipelines,buildGrid2Pipelines:buildGrid2Pipelines,writeSimParams:writeSimParams,buildGrid:buildGrid,useSparse:useSparse,prepareSnowGrains:prepareSnowGrains,runSnowGrains:runSnowGrains,readbackBuffer:readbackBuffer,writeGameParams:writeGameParams,setSparse:function(v){LIQUID_SPARSE=v;LIQUID_SPARSE_MIN_CELLS=1;},cell:${2.5}};`);
  new vm.Script(sources[name]);
  metadata[name]={path:filename,ref:filename?null:beforeRef,sha256:originalSHA,injectedContactWG:name==='after'?contactWG:256,testSourceSHA256:createHash('sha256').update(source).digest('hex')};
}
const bench=process.env.BENCH==='1';
const selectedCases=process.env.CASES?process.env.CASES.split(','):null;
if(process.env.DRY_RUN==='1'){console.log(JSON.stringify({sources:metadata,bench,selectedCases,out,port},null,2));process.exit(0);}
fs.mkdirSync(out,{recursive:true});
async function browserRun(bench,selectedCases){
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw Error('No WebGPU adapter');
  const timed=bench&&adapter.features.has('timestamp-query');
  if(bench&&!timed)throw Error('Benchmark requires timestamp-query');
  const device=await adapter.requestDevice({requiredFeatures:timed?['timestamp-query']:[],requiredLimits:{maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}});
  const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const fixtures=[];
  function fixture(name,snow,water,options={}){
    const particles=[];
    const columns=options.wide?128:16;
    for(let i=0;i<snow;i++)particles.push({x:45+(i%columns)*.66,y:45+Math.floor(i/columns)*.66,vx:i%7-3,vy:i%5,type:5});
    for(let i=0;i<water;i++)particles.push({x:44+(i%32)*.31,y:44+Math.floor(i/32)%32*.31,vx:20,vy:-30,type:i%3});
    // Interleave water so material filtering is exercised within every dense cell.
    particles.sort((a,b)=>((a.x+a.y)*17)%19-((b.x+b.y)*17)%19);
    fixtures.push({name,particles,...options});
  }
  fixture('mixed-dense',128,384);
  fixture('near-coincident',48,80,{coincident:true});
  fixture('moved-far-stale-grid',64,160,{move:true});
  fixture('clamped-edge-frozen-offregion',32,64,{edges:true});
  fixture('no-snow',0,128);
  fixture('water-heavy',128,4096);
  fixture('snow-heavy',512,512);
  fixture('actual-heavy-mixed',13600,11400,{wide:true});
  const pairedMixed=fixtures[fixtures.length-1];
  // Remove only water, retaining every snow position, velocity and relative order.
  fixtures.push({name:'actual-heavy-no-water',particles:pairedMixed.particles.filter(p=>p.type===5).map(p=>({...p})),pairedWith:pairedMixed.name});
  fixtures.push({name:'actual-heavy-snow-compressed',particles:pairedMixed.particles.filter(p=>p.type===5).map(p=>({...p,x:45+(p.x-45)*.4,y:45+(p.y-45)*.4})),pairedWith:pairedMixed.name,compressed:true});
  fixture('pure-snow-10k',10000,0,{wide:true});
  const chosen=selectedCases?fixtures.filter(f=>selectedCases.includes(f.name)):fixtures;
  if(!chosen.length)throw Error('No CASES matched');
  const results=[],raw={},reuseResults=[];let instance;
  function release(){if(!instance)return;for(const b of Object.values(instance.buf))b.destroy();instance.paramsBuf.destroy();instance.simParamsBuf.destroy();instance.snowGrainParams.destroy();for(const b of instance.gameParamsBufs)b.destroy();for(const t of ['snowAirTexture','snowProjectedAir'])instance[t].destroy();instance=null;}
  const words=ab=>Array.from(new Uint32Array(ab));
  function same(a,b,message){if(a.length!==b.length||a.some((x,i)=>x!==b[i]))throw Error(message);}
  try{
    for(const name of ['before','after']){
      const api=window.__snowAPIs[name];raw[name]=[];
      instance={device,queue:device.queue,maxParticles:32768,uploadedCount:0,frameEncoder:null,cellSize:2.5,stepDt:1/240,liquid:{getGameState:()=>({})}};
      device.pushErrorScope('validation');api.buildBuffers(instance);api.buildGridPipelines(instance);api.prepareSnowGrains(instance,1/240);api.writeGameParams(instance,1);
      const buildError=await device.popErrorScope();if(buildError)throw Error(name+' build: '+buildError.message);
      for(const sparse of [false,true]){
        if(sparse&&!instance.sparseGridOK)continue;
        api.setSparse(sparse?1:0);
        // Grid-only tests do not construct unrelated P2G/pressure pipelines.
        // Their readiness gates may be satisfied because clearPrev is false.
        instance.sparseP2GOK=true;instance.sparseGrid2OK=true;
        if(api.useSparse(instance)!==sparse)throw Error('Requested grid path unavailable');
        for(const fixture of chosen){
          const n=fixture.particles.length,capacity=instance.maxParticles,cells=4096;
          instance.uploadedCount=n;instance.grid={w:64,h:64,cells};
          const p=new Float32Array(capacity*4),aux=new Float32Array(capacity*4),affine=new Float32Array(capacity*4),flags=new Uint32Array(capacity);
          fixture.particles.forEach((v,i)=>{let x=v.x,y=v.y;if(fixture.coincident&&v.type===5){x=50+(i%2)*.00001;y=50;}
            if(fixture.edges){if(i%7===0)x=-12;if(i%11===0)y=170;if(i%13===0)x=210;}
            p.set([x,y,v.vx,v.vy],i*4);aux.set([3.2,.17,x,y],i*4);affine.set([.7,0,0,.6],i*4);
            flags[i]=(v.type&3)|((v.type&4)<<4)|8|(29<<8);if(fixture.edges&&i%5===0)flags[i]|=32;
          });
          const gridPos=p.slice();
          const u=instance.paramsHost,f=instance.paramsHostF;u.fill(0);u[0]=n;u[1]=64;u[2]=64;u[5]=cells;f[6]=1/240;f[7]=.4;f[8]=64;f[9]=32;f[10]=64;f.set([-30,-30,190,190],16);instance.queue.writeBuffer(instance.paramsBuf,0,u);
          for(const [key,data] of Object.entries({pos:p,aux,affine,flag:flags}))instance.queue.writeBuffer(instance.buf[key],0,data);
          const clear=device.createCommandEncoder();clear.clearBuffer(instance.buf.cellCount);clear.clearBuffer(instance.buf.cellCursor);clear.clearBuffer(instance.buf.blockBitmap);device.queue.submit([clear.finish()]);
          device.pushErrorScope('validation');api.buildGrid(instance,false,name==='after');
          const [countAB,startAB,sortedAB,cellAB]=await Promise.all(['cellCount','cellStart','sortedIdx','cellOf'].map(key=>api.readbackBuffer(instance,instance.buf[key],(key==='cellCount'||key==='cellStart'?cells:capacity)*4)));
          const counts=new Uint32Array(countAB),starts=new Uint32Array(startAB),sorted=new Uint32Array(sortedAB),cellOf=new Uint32Array(cellAB),members=Array.from({length:cells},()=>[]);
          for(let i=0;i<n;i++){
            const x=gridPos[i*4],y=gridPos[i*4+1];if(x < -30||x>190||y < -30||y>190)continue;
            if(name==='after'&&fixture.particles[i].type!==5)continue;
            const cx=Math.min(63,Math.max(0,Math.floor(x/2.5))),cy=Math.min(63,Math.max(0,Math.floor(y/2.5)));members[cy*64+cx].push(i);
          }
          const canonical=new Uint32Array(capacity);
          for(let c=0;c<cells;c++){
            if(counts[c]!==members[c].length)throw Error(name+'/'+fixture.name+': count cell'+c);
            same(Array.from(sorted.slice(starts[c],starts[c]+counts[c])).sort((a,b)=>a-b),members[c],name+'/'+fixture.name+': membership cell'+c);
            canonical.set(members[c],starts[c]);
          }
          // Production scatter is atomic and unordered. Canonicalize both versions
          // identically, retaining snow relative order for exact accumulation checks.
          instance.queue.writeBuffer(instance.buf.sortedIdx,0,canonical);
          if(fixture.move)for(let i=0;i<n;i++)if(fixture.particles[i].type===5){p[i*4]+=i%2?12:-9;p[i*4+1]+=i%3?0:8;}
          const initial={pos:p,aux:aux,affine:affine,flag:flags};
          function reset(){for(const [key,data] of Object.entries(initial))instance.queue.writeBuffer(instance.buf[key],0,data);}
          function encode(query){const enc=device.createCommandEncoder();instance.frameEncoder=enc;
            if(query){const begin=enc.beginComputePass.bind(enc);let index=0;enc.beginComputePass=function(d){return begin({...d,timestampWrites:{querySet:query,beginningOfPassWriteIndex:index++,endOfPassWriteIndex:index++}});};}
            api.runSnowGrains(instance,'contacts',undefined,true);api.runSnowGrains(instance,'shield');api.runSnowGrains(instance,'trackMotion');instance.frameEncoder=null;return enc;}
          reset();device.queue.submit([encode().finish()]);
          const outputs={};const checkedCount=Math.min(capacity,n+259);
          for(const key of ['pos','aux','affine','flag'])outputs[key]=words(await api.readbackBuffer(instance,instance.buf[key],checkedCount*(key==='flag'?4:16)));
          outputs.cellMotion=words(await api.readbackBuffer(instance,instance.buf.cellCursor,cells*4));
          const validation=await device.popErrorScope();if(validation)throw Error(name+'/'+fixture.name+': '+validation.message);
          const occupied=members.filter(m=>m.length);
          const row={name:fixture.name,sparse,n,snow:fixture.particles.filter(v=>v.type===5).length,
            pairedWith:fixture.pairedWith||null,compressed:!!fixture.compressed,
            gridStats:{occupiedCells:occupied.length,maxCellParticles:Math.max(0,...occupied.map(m=>m.length)),
              meanOccupiedParticles:occupied.length?occupied.reduce((total,m)=>total+m.length,0)/occupied.length:0},outputs};
          if(bench&&['water-heavy','snow-heavy','actual-heavy-mixed','actual-heavy-no-water','actual-heavy-snow-compressed','pure-snow-10k'].includes(fixture.name)){
            const query=device.createQuerySet({type:'timestamp',count:6}),resolve=device.createBuffer({size:256,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),read=device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),samples=[];
            try{for(let s=0;s<25;s++){reset();const enc=encode(query);enc.resolveQuerySet(query,0,6,resolve,0);enc.copyBufferToBuffer(resolve,0,read,0,48);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const t=new BigUint64Array(read.getMappedRange());const ms=Number(t[1]-t[0]+t[3]-t[2]+t[5]-t[4])/1e6;read.unmap();if(s>=5)samples.push(ms);}row.ms=samples;row.medianMs=samples.sort((a,b)=>a-b)[samples.length>>1];}finally{query.destroy();resolve.destroy();read.destroy();}
          }
          raw[name].push(row);
        }
      }
      // Exercise real shared-field clearing between changing index materials.
      // P2G and pressure need only their production clear pipelines here.
      device.pushErrorScope('validation');
      api.buildP2GPipelines(instance);api.buildGrid2Pipelines(instance);api.writeSimParams(instance);
      const reuseBuildError=await device.popErrorScope();if(reuseBuildError)throw Error('Reuse pipeline build: '+reuseBuildError.message);
      if(!instance.sparseP2GOK||!instance.sparseGrid2OK)throw Error('Production sparse clear pipelines unavailable');
      api.setSparse(1);
      const reuse=chosen.find(f=>f.particles.some(p=>p.type===5)&&f.particles.some(p=>p.type!==5))||fixtures[0];
      const n=reuse.particles.length,cells=4096,positions=new Float32Array(n*4),flags=new Uint32Array(n);
      reuse.particles.forEach((p,i)=>{positions.set([p.x,p.y,p.vx,p.vy],i*4);flags[i]=(p.type&3)|((p.type&4)<<4)|8;});
      instance.uploadedCount=n;instance.grid={w:64,h:64,cells};
      const u=instance.paramsHost,f=instance.paramsHostF;u.fill(0);u[0]=n;u[1]=64;u[2]=64;u[5]=cells;f[6]=1/240;f[7]=.4;f[8]=64;f[9]=32;f[10]=64;f.set([-30,-30,190,190],16);
      instance.queue.writeBuffer(instance.paramsBuf,0,u);instance.queue.writeBuffer(instance.buf.pos,0,positions);instance.queue.writeBuffer(instance.buf.flag,0,flags);
      const reset=device.createCommandEncoder();reset.clearBuffer(instance.buf.cellCount);reset.clearBuffer(instance.buf.cellCursor);reset.clearBuffer(instance.buf.blockBitmap);device.queue.submit([reset.finish()]);
      const sequence=[false,true,true,false],fields=['cellMass','cellOilMass','cellAeration','cellVX','cellVY','cellDVX','cellDVY','cellVelX','cellVelY','cellHeat'];
      let priorBlocks=[];
      for(let step=0;step<sequence.length;step++){
        const snowOnly=name==='after'&&sequence[step];
        if(step){
          // Only dirty blocks that the preceding real count build published.
          // This preserves the global-zero invariant outside those blocks.
          const markers=new Uint32Array(cells);
          for(const block of priorBlocks)for(let y=0;y<16;y++)for(let x=0;x<16;x++)markers[(Math.floor(block/4)*16+y)*64+(block%4)*16+x]=12345;
          for(const key of fields)instance.queue.writeBuffer(instance.buf[key],0,markers);
          instance.queue.writeBuffer(instance.buf.cellOilMass,2097152*4,markers);
        }
        device.pushErrorScope('validation');
        api.buildGrid(instance,step>0,snowOnly);
        const counts=new Uint32Array(await api.readbackBuffer(instance,instance.buf.cellCount,cells*4));
        const expected=new Uint32Array(cells);
        reuse.particles.forEach((p,i)=>{if(snowOnly&&p.type!==5)return;if(p.x < -30||p.x>190||p.y < -30||p.y>190)return;const x=Math.max(0,Math.min(63,Math.floor(p.x/2.5))),y=Math.max(0,Math.min(63,Math.floor(p.y/2.5)));expected[y*64+x]++;});
        same(Array.from(counts),Array.from(expected),name+' shared grid sequence '+step);
        if(step){
          for(const key of fields){const values=new Uint32Array(await api.readbackBuffer(instance,instance.buf[key],cells*4));if(values.some(v=>v!==0))throw Error(name+' shared clear '+step+' '+key);}
          // The snow mass plane shares cellOilMass after GRID_MAX_CELLS.
          const plane=device.createBuffer({size:cells*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
          try{const copy=device.createCommandEncoder();copy.copyBufferToBuffer(instance.buf.cellOilMass,2097152*4,plane,0,cells*4);device.queue.submit([copy.finish()]);await plane.mapAsync(GPUMapMode.READ);if(new Uint32Array(plane.getMappedRange()).some(v=>v!==0))throw Error(name+' shared snow mass clear '+step);plane.unmap();}finally{plane.destroy();}
        }
        const meta=new Uint32Array(await api.readbackBuffer(instance,instance.buf.blockMeta,16));
        priorBlocks=Array.from(new Uint32Array(await api.readbackBuffer(instance,instance.buf.blockList,meta[0]*4)));
        const validation=await device.popErrorScope();if(validation)throw Error(name+' reuse '+step+': '+validation.message);
        reuseResults.push({source:name,step,snowOnly,particles:counts.reduce((a,b)=>a+b,0),priorBlocks:priorBlocks.length,sharedFieldsCleared:step?fields.length+1:0});
      }
      await device.queue.onSubmittedWorkDone();release();
    }
    for(let i=0;i<raw.before.length;i++){const a=raw.before[i],b=raw.after[i];if(!b||a.name!==b.name||a.sparse!==b.sparse)throw Error('Case alignment');for(const key of ['pos','aux','affine','flag','cellMotion'])same(a.outputs[key],b.outputs[key],a.name+'/'+a.sparse+'/'+key+' exact output');results.push({name:a.name,sparse:a.sparse,n:a.n,snow:a.snow,pairedWith:a.pairedWith,compressed:a.compressed,exact:true,beforeGrid:a.gridStats,afterGrid:b.gridStats,beforeMedianMs:a.medianMs,afterMedianMs:b.medianMs});}
    if(errors.length)throw Error(errors.join(';'));
    return {pass:true,results,reuseResults,errors,adapter:adapter.info,limitation:'Contacts, shielding and displacement tracking plus production grid membership. Main fixtures start with full grid clears; a separate sparse water/snow/snow/water sequence verifies production P2G/pressure clear pipelines without executing their physics. Canonical within-cell ordering isolates filtering from nondeterministic atomic scatter. Timing excludes terrain/guest collision, rendering, and full gameplay.'};
  }finally{release();device.destroy();}
}
const program='window.__runSnowNeighbors='+browserRun.toString()+';';
const html='<meta charset="utf-8"><title>Snow neighbor GPU regression</title><script>window.__snowAPIs={}</script><script src="/before.js"></script><script src="/after.js"></script><script src="/test.js"></script>';
const server=createServer((req,res)=>{const f={'/':html,'/before.js':sources.before,'/after.js':sources.after,'/test.js':program}[new URL(req.url,'http://localhost').pathname];res.writeHead(f?200:404,{'Content-Type':req.url==='/'?'text/html':'text/javascript'}).end(f||'');});
let chrome,socket,seq=0;const pending=new Map();const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},240000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-snow-neighbors-'));
try{
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  chrome=spawn(process.env.CHROME||path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+debugPort,'about:blank'],{stdio:'ignore'});
  let tab;for(let i=0;i<100;i++){try{tab=(await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page');if(tab)break;}catch{}await sleep(100);}assert(tab,'Testing browser boot');
  socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}};
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
  for(let i=0;i<100;i++){if(await ev('!!window.__snowAPIs?.after&&!!window.__runSnowNeighbors'))break;await sleep(50);}
  const result=await ev('__runSnowNeighbors('+bench+','+JSON.stringify(selectedCases)+')');result.sources=metadata;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));assert(result.pass);
}finally{
  if(socket){try{await send('Browser.close');}catch{}socket.close();}
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Cleanup'));}pending.clear();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(1500)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}server.close();fs.rmSync(profile,{recursive:true,force:true});
}
