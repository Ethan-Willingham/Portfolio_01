#!/usr/bin/env node
// Actual GPU acceptance for bounded snow contacts and internal physical laws.
// DRY_RUN=1 checks source hooks without launching Chrome for Testing.
// BEFORE=/path/reference.js AFTER=/path/candidate.js CASES=sparse-two-exact DUMP=/tmp/snow-bounded
// Defaults: pinned v28.129 reference and current tracked GPU source.
// Candidate mass, energy, symmetry and bounded momentum error gate success.
// A failed baseline shared-motion law stays diagnostic, with a non-regression gate.
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
const out=process.env.DUMP||'/tmp/sluice-snow-bounded-gpu';
const port=Number(process.env.PORT||8302),debugPort=port+1000;
const sources={},metadata={};
const beforeRef='16a7400';
for(const name of ['before','after']){
  const filename=process.env[name.toUpperCase()]||(name==='after'?path.join(root,'js/liquid-wgpu.js'):null);
  const source=filename?fs.readFileSync(filename,'utf8'):execFileSync('git',['show',beforeRef+':js/liquid-wgpu.js'],{cwd:root,encoding:'utf8',maxBuffer:4*1024*1024});
  const originalSHA=createHash('sha256').update(source).digest('hex');
  const marker='  window.LiquidWGPU = { create: create, stage: STAGE, last: null };';
  assert.equal(source.split(marker).length,2,'Source export anchor');
  sources[name]=source.replace(marker,marker+`\nwindow.__snowAPIs.${name}={buildBuffers:buildBuffers,buildGridPipelines:buildGridPipelines,buildGrid:buildGrid,prepareSnowGrains:prepareSnowGrains,runSnowGrains:runSnowGrains,readbackBuffer:readbackBuffer,writeGameParams:writeGameParams,setSparse:function(v){LIQUID_SPARSE=v;LIQUID_SPARSE_MIN_CELLS=1;}};`);
  new vm.Script(sources[name]);
  metadata[name]={path:filename,ref:filename?null:beforeRef,sha256:originalSHA};
}
const selectedCases=process.env.CASES?process.env.CASES.split(','):null;
if(process.env.DRY_RUN==='1'){console.log(JSON.stringify({sources:metadata,selectedCases,out,port},null,2));process.exit(0);}
assert(!path.resolve(out).startsWith(root+path.sep),'DUMP must stay outside the repository');
fs.mkdirSync(out,{recursive:true});
async function browserBounded(selectedCases){
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw Error('No WebGPU adapter');
  const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}});
  const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const diameter=2.5/Math.sqrt(3.2),fixtures=[];
  const grain=(x,y,vx=0,vy=0,extra={})=>({x,y,vx,vy,type:5,...extra});
  fixtures.push({name:'sparse-two-exact',particles:[grain(40,40),grain(41,40)],iterations:1,exact:true});
  for(const n of [64,512])fixtures.push({name:'coincident-'+n,particles:Array.from({length:n},()=>grain(40,40)),iterations:24,stationary:true,coincident:true});
  const symmetric=Array.from({length:64},(_,i)=>grain(40+(i%8-3.5)*.2,40+(Math.floor(i/8)-3.5)*.2));
  fixtures.push({name:'symmetric-stationary',particles:symmetric,iterations:24,stationary:true,symmetric:true});
  fixtures.push({name:'shared-velocity',particles:symmetric.map(p=>({...p,vx:20,vy:7})),iterations:12,shared:true});
  fixtures.push({name:'approaching-clusters',particles:Array.from({length:128},(_,i)=>grain(40+(i<64?-1:1)+(i%8-3.5)*.15,40+(Math.floor(i%64/8)-3.5)*.15,i<64?12:-12,0)),iterations:16,approaching:true});
  fixtures.push({name:'mixed-water-frozen',particles:[...symmetric,...Array.from({length:64},(_,i)=>grain(40+(i%8)*.1,40+Math.floor(i/8)*.1,17,-9,{type:i%3,unchanged:true})),...Array.from({length:16},(_,i)=>grain(40+i*.05,40,0,0,{frozen:true,unchanged:true})),grain(200,200,10,5,{unchanged:true})],iterations:12,stationary:true});
  const chosen=selectedCases?fixtures.filter(f=>selectedCases.includes(f.name)):fixtures;
  if(!chosen.length)throw Error('No cases selected');
  const raw={},checks=[],failures=[],referenceFailures=[],diagnosticFailures=[];let instance;
  function check(name,pass,actual,limit,diagnostic=false){checks.push({name,pass,actual,limit,diagnostic});if(!pass)(diagnostic?diagnosticFailures:name.startsWith('before/')?referenceFailures:failures).push(name);}
  function release(){if(!instance)return;for(const b of Object.values(instance.buf))b.destroy();instance.paramsBuf.destroy();instance.simParamsBuf.destroy();instance.snowGrainParams.destroy();for(const b of instance.gameParamsBufs)b.destroy();for(const t of ['snowAirTexture','snowProjectedAir'])instance[t].destroy();instance=null;}
  function metrics(particles,state){
    const indexes=particles.map((p,i)=>p.type===5&&!p.frozen&&!p.unchanged?i:-1).filter(i=>i>=0);
    let x=0,y=0,px=0,py=0,energy=0,maxSpeed=0,minDistance=Infinity;
    for(const i of indexes){x+=state[i*4];y+=state[i*4+1];px+=state[i*4+2];py+=state[i*4+3];const v2=state[i*4+2]**2+state[i*4+3]**2;energy+=v2;maxSpeed=Math.max(maxSpeed,Math.sqrt(v2));}
    x/=indexes.length;y/=indexes.length;let radius2=0;
    for(const i of indexes)radius2+=(state[i*4]-x)**2+(state[i*4+1]-y)**2;
    let overlap2=0,pairs=0;
    for(let a=0;a<indexes.length;a++)for(let b=a+1;b<indexes.length;b++){
      const i=indexes[a]*4,j=indexes[b]*4,d=Math.hypot(state[i]-state[j],state[i+1]-state[j+1]);minDistance=Math.min(minDistance,d);
      if(d<diameter){overlap2+=(diameter-d)**2;pairs++;}
    }
    return {n:indexes.length,centroid:[x,y],momentum:[px,py],energy,maxSpeed,rmsRadius:Math.sqrt(radius2/indexes.length),overlap2,overlapPairs:pairs,minDistance};
  }
  try{
    for(const name of ['before','after']){
      raw[name]=[];const api=window.__snowAPIs[name];
      instance={device,queue:device.queue,maxParticles:1024,uploadedCount:0,frameEncoder:null,cellSize:2.5,stepDt:1/240,liquid:{getGameState:()=>({})}};
      device.pushErrorScope('validation');api.buildBuffers(instance);api.buildGridPipelines(instance);api.prepareSnowGrains(instance,1/240);api.writeGameParams(instance,1);
      const error=await device.popErrorScope();if(error)throw Error(name+' builder: '+error.message);
      api.setSparse(0);
      for(const fixture of chosen){
        const n=fixture.particles.length,cells=4096,capacity=1024,pos=new Float32Array(capacity*4),aux=new Float32Array(capacity*4),affine=new Float32Array(capacity*4),flag=new Uint32Array(capacity);
        fixture.particles.forEach((p,i)=>{pos.set([p.x,p.y,p.vx,p.vy],i*4);aux.set([3.2,.17,p.x,p.y],i*4);affine.set([.7,0,0,.6],i*4);flag[i]=(p.type&3)|((p.type&4)<<4)|8|(29<<8)|(p.frozen?32:0);});
        const initialPos=pos.slice(),initialAux=aux.slice(),initialAffine=affine.slice(),initialFlag=flag.slice();
        instance.uploadedCount=n;instance.grid={w:64,h:64,cells};const u=instance.paramsHost,f=instance.paramsHostF;u.fill(0);u[0]=n;u[1]=u[2]=64;u[5]=cells;f[6]=1/240;f[7]=.4;f[8]=64;f[9]=32;f[10]=64;f.set([0,0,160,160],16);instance.queue.writeBuffer(instance.paramsBuf,0,u);
        for(const [key,data] of Object.entries({pos,aux,affine,flag}))instance.queue.writeBuffer(instance.buf[key],0,data);
        const history=[metrics(fixture.particles,pos)];
        device.pushErrorScope('validation');
        for(let iteration=0;iteration<fixture.iterations;iteration++){
          // Fresh real snow grid and fresh cell-motion tags for every relaxation.
          api.buildGrid(instance,false,true);
          const count=new Uint32Array(await api.readbackBuffer(instance,instance.buf.cellCount,cells*4));
          const start=new Uint32Array(await api.readbackBuffer(instance,instance.buf.cellStart,cells*4));
          const canonical=new Uint32Array(capacity),members=Array.from({length:cells},()=>[]);
          for(let i=0;i<n;i++)if(fixture.particles[i].type===5&&pos[i*4]>=0&&pos[i*4]<=160&&pos[i*4+1]>=0&&pos[i*4+1]<=160){const x=Math.max(0,Math.min(63,Math.floor(pos[i*4]/2.5))),y=Math.max(0,Math.min(63,Math.floor(pos[i*4+1]/2.5)));members[y*64+x].push(i);}
          for(let c=0;c<cells;c++){if(count[c]!==members[c].length)throw Error('Grid snow mass mismatch');canonical.set(members[c],start[c]);}
          instance.queue.writeBuffer(instance.buf.sortedIdx,0,canonical);
          const encoder=device.createCommandEncoder();instance.frameEncoder=encoder;api.runSnowGrains(instance,'contacts',undefined,true);instance.frameEncoder=null;device.queue.submit([encoder.finish()]);
          pos.set(new Float32Array(await api.readbackBuffer(instance,instance.buf.pos,capacity*16)));
          history.push(metrics(fixture.particles,pos));
        }
        const outputs={pos:Array.from(new Uint32Array(pos.buffer))};
        for(const key of ['aux','affine','flag'])outputs[key]=Array.from(new Uint32Array(await api.readbackBuffer(instance,instance.buf[key],capacity*(key==='flag'?4:16))));
        const validation=await device.popErrorScope();if(validation)throw Error(name+'/'+fixture.name+': '+validation.message);
        const initial=history[0],final=history.at(-1),drift=Math.hypot(final.centroid[0]-initial.centroid[0],final.centroid[1]-initial.centroid[1]);
        const row={name:fixture.name,source:name,iterations:fixture.iterations,initial,final,centroidDrift:drift,history,outputs};raw[name].push(row);
        check(name+'/'+fixture.name+'/finite',Array.from(pos.slice(0,n*4)).every(Number.isFinite),null,'All active state finite');
        check(name+'/'+fixture.name+'/identity and mass',outputs.flag.slice(0,n).every((v,i)=>v===initialFlag[i]),n,'Every seeded flag remains unchanged');
        const original={pos:Array.from(new Uint32Array(initialPos.buffer)),aux:Array.from(new Uint32Array(initialAux.buffer)),affine:Array.from(new Uint32Array(initialAffine.buffer)),flag:Array.from(initialFlag)};
        const controls=fixture.particles.map((p,i)=>p.unchanged?i:-1).filter(i=>i>=0);
        check(name+'/'+fixture.name+'/passive controls',controls.every(i=>['pos','aux','affine','flag'].every(k=>{const width=k==='flag'?1:4;return Array.from({length:width},(_,j)=>(k==='affine'&&j===2&&fixture.particles[i].type===5)||outputs[k][i*width+j]===original[k][i*width+j]).every(Boolean);})),controls.length,'Water and passive snow physical state unchanged; snow affine.z is grid scratch');
        if(fixture.stationary){check(name+'/'+fixture.name+'/no invented kinetic energy',final.maxSpeed<=1e-5,final.maxSpeed,'<=0.00001 px/s');}
        if(fixture.coincident){check(name+'/'+fixture.name+'/overlap improves',final.overlap2<initial.overlap2*.8,final.overlap2/initial.overlap2,'At least20% decrease in total squared penetration after24 relaxations');check(name+'/'+fixture.name+'/spreads',final.rmsRadius>diameter*.1,final.rmsRadius,'RMS radius greater than0.1grain diameter');}
        if(fixture.symmetric){check(name+'/'+fixture.name+'/centroid stable',drift<=diameter*.1,drift,'<=0.1 grain diameter over24 relaxations');}
        if(fixture.shared){
          const maxError=Math.max(...fixture.particles.map((p,i)=>Math.hypot(pos[i*4+2]-p.vx,pos[i*4+3]-p.vy)));
          row.sharedVelocityMaxError=maxError;
          const reference=name==='after'?raw.before.find(r=>r.name===fixture.name):null;
          const knownLimitation=reference&&reference.sharedVelocityMaxError>1e-4;
          check(name+'/'+fixture.name+'/shared velocity preserved',maxError<=1e-4,maxError,'Internal constraints preserve common velocity within0.0001 px/s',!!knownLimitation);
          if(knownLimitation)check(name+'/'+fixture.name+'/shared motion does not regress',maxError<=reference.sharedVelocityMaxError+1e-4,maxError,'Maximum velocity error no greater than the measured accepted reference plus0.0001 px/s');
        }
        if(fixture.approaching){const momentumError=Math.hypot(final.momentum[0]-initial.momentum[0],final.momentum[1]-initial.momentum[1])/(initial.n*12);row.momentumRelativeError=momentumError;check(name+'/'+fixture.name+'/no kinetic energy gain',Math.max(...history.map(h=>h.energy))<=initial.energy*1.001,Math.max(...history.map(h=>h.energy))/initial.energy,'<=0.1% gain above initial energy');check(name+'/'+fixture.name+'/momentum error bounded',momentumError<=.01,momentumError,'<=1% of sum initial momentum magnitudes');}
      }
      release();
    }
    for(const fixture of chosen.filter(f=>f.exact)){
      const a=raw.before.find(r=>r.name===fixture.name),b=raw.after.find(r=>r.name===fixture.name);
      check(fixture.name+'/exact differential',['pos','aux','affine','flag'].every(k=>a.outputs[k].every((v,i)=>v===b.outputs[k][i])),null,'Sparse complete buffers bit-identical');
    }
    if(errors.length)failures.push(...errors);
    return {pass:failures.length===0,checks,failures,referenceFailures,diagnosticFailures,errors,results:raw,adapter:adapter.info,
      limitation:'Pure internal contact acceptance, no gravity, prediction, walls, guest collision, rendering or frame-rate claim. Dense approximation is checked against physical laws rather than exact dense trajectories. Canonical cell order isolates sampling from atomic scatter order. Reference physical-law failures are reported. If the reference fails common-motion invariance, the candidate must not increase its measured error; that known limitation remains diagnostic, not a claim of invariance.'};
  }finally{release();device.destroy();}
}
const program='window.__runSnowNeighbors='+browserBounded.toString()+';';
const html='<meta charset="utf-8"><title>Snow bounded contact physics acceptance</title><script>window.__snowAPIs={}</script><script src="/before.js"></script><script src="/after.js"></script><script src="/test.js"></script>';
const server=createServer((req,res)=>{const f={'/':html,'/before.js':sources.before,'/after.js':sources.after,'/test.js':program}[new URL(req.url,'http://localhost').pathname];res.writeHead(f?200:404,{'Content-Type':req.url==='/'?'text/html':'text/javascript'}).end(f||'');});
let chrome,socket,seq=0;const pending=new Map();const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},240000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-snow-bounded-'));
try{
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  chrome=spawn(process.env.CHROME||path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--user-data-dir='+profile,'--remote-debugging-port='+debugPort,'about:blank'],{stdio:'ignore'});
  let tab;for(let i=0;i<100;i++){try{tab=(await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json()).find(t=>t.type==='page');if(tab)break;}catch{}await sleep(100);}assert(tab,'Testing browser boot');
  socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}};
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:'http://127.0.0.1:'+port+'/'});
  for(let i=0;i<100;i++){if(await ev('!!window.__snowAPIs?.after&&!!window.__runSnowNeighbors'))break;await sleep(50);}
  const result=await ev('__runSnowNeighbors('+JSON.stringify(selectedCases)+')');result.sources=metadata;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({pass:result.pass,failures:result.failures,referenceFailures:result.referenceFailures,diagnosticFailures:result.diagnosticFailures,checks:result.checks,results:Object.fromEntries(Object.entries(result.results).map(([key,rows])=>[key,rows.map(({outputs,history,...row})=>row)])),report:path.join(out,'report.json')},null,2));assert(result.pass);
}catch(error){
  fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({message:error.message,sources:metadata},null,2)+'\n');
  throw error;
}finally{
  if(socket){try{await send('Browser.close');}catch{}socket.close();}
  for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Cleanup'));}pending.clear();
  if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await Promise.race([new Promise(r=>chrome.once('exit',r)),sleep(1500)]);if(chrome.exitCode===null)chrome.kill('SIGKILL');}server.close();fs.rmSync(profile,{recursive:true,force:true});
}
