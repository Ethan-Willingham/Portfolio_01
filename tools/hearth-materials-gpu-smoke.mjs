// Actual WebGPU checks for catalog adapters. Owns a separate testing browser.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkFireKernels} from './fire-kernel-checks.mjs';
import {checkFireMaterials} from './fire-material-checks.mjs';
import {checkFireRendering} from './fire-render-checks.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||8318),debug=port+1000,profile=fs.mkdtempSync('/tmp/sluice-material-gpu-');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let chrome,ws,id=0;const pending=new Map(),errors=[];
const server=createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><body style="background:#1a1008"><script src="/js/fire-wgpu.js"></script><script src="/js/sluice/077-hearth-materials.js"></script><script src="/js/sluice/077-hearth-combustion.js"></script><script src="/js/sluice/077-hearth-fracture.js"></script><script src="/js/sluice/077-hearth-geometry.js"></script><script src="/js/sluice/077-hearth-physics.js"></script><script src="/js/sluice/078-hearth-art.js"></script><script src="/js/sluice/078-fire-bridge.js"></script>');return;}
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}
});
function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;}
try{
  await new Promise(r=>server.listen(port,'127.0.0.1',r));
  chrome=spawn(process.env.CHROME||`${process.env.HOME}/.local/bin/agent-chrome-for-testing`,['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--disable-gpu-sandbox',`--user-data-dir=${profile}`,`--remote-debugging-port=${debug}`,'about:blank'],{stdio:'ignore'});
  let endpoint;for(let n=0;n<100;n++){try{endpoint=(await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p=>p.type==='page')?.webSocketDebuggerUrl;if(endpoint)break;}catch{}await sleep(100);}
  assert(endpoint);ws=new WebSocket(endpoint);await new Promise(r=>ws.addEventListener('open',r));
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(m.error):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
  await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url:`http://127.0.0.1:${port}/`});
  for(let n=0;n<100;n++){if(await ev('!!window.FireWGPU && typeof HEARTH_MATERIALS!=="undefined"'))break;await sleep(50);}
  assert(await ev('(async()=>{window.testDevice=await(await navigator.gpu.requestAdapter()).requestDevice();return !!testDevice;})()'));
  for(const suite of [checkFireKernels,checkFireMaterials,checkFireRendering]){
    const results=await ev(`(${suite.toString()})(testDevice)`);
    for(const r of results){assert(r.pass,JSON.stringify(r));console.log('PASS',r.label);}
  }
  const results=await ev(`(async()=>{
    const results={},sim=FireWGPU.create({device:testDevice,width:96});await sim.readyPromise;
    if(!sim.available)throw Error(sim.errors.join(' '));
    for(const id of HEARTH_MATERIAL_ORDER){
      sim.reset();const m=hearthMaterial(id),body={id:1,x:160,y:165,r:32,baseR:34,angle:0,life:m.life,material:id,materialData:m,dryKg:.018*m.density,
        volatile:m.volatile,carbon:m.role==='fuel'?1-m.volatile:0,moisture:0,heat:0,core:0,vertices:[[132,137],[188,137],[188,193],[132,193]]};
      if(m.role==='fuel')sim.ignite(body);else{body.heat=.75;body.core=.65;}
      let captured=0;
      for(let n=0;n<300;n+=4){sim.step(4/60,[body],{damper:1});await testDevice.queue.onSubmittedWorkDone();await new Promise(r=>setTimeout(r,0));captured+=sim.outputKW*4/60;}
      const snap=await sim.snapshot();results[id]={fuel:body.fuel,heat:body.heat,ash:body.ash,lit:body.lit,energy:captured,finite:Array.from(snap.fields).every(Number.isFinite),errors:sim.errors.slice()};
    }
    sim.dispose();return results;
  })()`);
  for(const [id,r]of Object.entries(results)){assert(r.finite&&!r.errors.length,id+' bounded GPU fields');if(['copper','malachite'].includes(id))assert(r.fuel===0&&!r.ash&&!r.lit,id+' is not combustible');console.log('MATERIAL',id,r);}
  assert(results.methaneice.fuel<results.coal.fuel-.15,'methane ice releases fuel much faster');
  assert(results.methaneice.energy>results.coal.energy,'methane ice transfers more actual heat');
  assert(results.sulfur.energy<results.coal.energy,'sulfur transfers less actual heat');
  const cpuEnergy=await ev(`(()=>{
    hearthReset();const bed=hearthBeds.boiler,b=hearthAddChunk('boiler',160,165,'coal');
    b.r=32;b.baseR=34;b.x=160;b.y=165;b.angle=0;b.life=100;b.dryKg=.018;b.moisture=0;b.generation=2;
    b.shape=[[-.875,-.875],[.875,-.875],[.875,.875],[-.875,.875]];hearthHullCache.delete(b);hearthWorldHull(b);
    hearthLightChunk(bed,b);let captured=0;
    for(let i=0;i<150;i++){hearthBurnStep(bed,1/30);captured+=b.thermalKW/30;}
    return captured;
  })()`);
  const captureRatio=cpuEnergy/results.coal.energy;
  assert(captureRatio>.4 && captureRatio<2,'CPU/GPU captured coal energy agrees within bounded-model tolerance, ratio '+captureRatio);
  console.log('PASS CPU/GPU common vessel capture boundary',{cpuEnergy,gpuEnergy:results.coal.energy,captureRatio});
  const colors=await ev(`(async()=>{
    const sim=FireWGPU.create({device:testDevice,width:96,testing:true});await sim.readyPromise;
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=420;const c=canvas.getContext('2d',{willReadFrequently:true}),colors={};
    for(const id of ['coal','methaneice','copper','malachite']){
      sim.reset();const material=hearthMaterial(id),b={id:1,x:160,y:165,r:32,baseR:34,angle:0,life:100,material:id,materialData:material,dryKg:.018,
        heat:.75,core:.65,volatile:material.volatile,carbon:material.role==='fuel'?1-material.volatile:0,vertices:[[132,137],[188,137],[188,193],[132,193]]};
      const state=await sim.testKernel('geometry',{chunks:[b]}),fields=new Float32Array(sim.width*sim.height*8);
      for(let n=0;n<fields.length/8;n++)if(state.mask[n*2]===-1)fields.set([0,.275,.895,.01,826,0,0,0],n*8);
      await sim.testKernel('transport',{fields,damper:0});sim.draw({x:0,y:0,w:640,h:420},document.body);
      c.clearRect(0,0,640,420);c.drawImage(sim.canvas,0,0,640,420);colors[id]=Array.from(c.getImageData(320,245,1,1).data);
    }
    sim.dispose();return colors;
  })()`);
  assert(colors.methaneice[2]/Math.max(1,colors.methaneice[0])>colors.coal[2]/Math.max(1,colors.coal[0])+.2,'methane flame has a distinct blue spectrum');
  assert(colors.copper[1]/Math.max(1,colors.copper[0])>colors.coal[1]/Math.max(1,colors.coal[0])+.2,'hot copper tints actual flame green');
  assert(colors.malachite[2]>colors.copper[2],'malachite has a distinct turquoise spectrum');
  console.log('PASS actual GPU material flame colors',colors);
  const ghost=await ev(`(()=>{
    window.BLD=new Proxy({}, {get:()=> '#888888'});const c=document.createElement('canvas');c.width=c.height=180;const ctx=c.getContext('2d',{willReadFrequently:true}),result=[];
    for(const id of HEARTH_MATERIAL_ORDER){
      ctx.clearRect(0,0,180,180);ctx.globalAlpha=.48;const body=hearthFuelPreview(id);hearthDrawCoal(ctx,body,90,90,1,0);
      const data=ctx.getImageData(0,0,180,180).data;let max=0,visible=0;for(let i=3;i<data.length;i+=4){max=Math.max(max,data[i]);if(data[i])visible++;}
      result.push({id,max,visible,alpha:ctx.globalAlpha});
    }return result;
  })()`);
  for(const r of ghost){assert(r.visible>500 && r.max>=120 && r.max<=123,JSON.stringify(r));assert(Math.abs(r.alpha-.48)<.001);}
  console.log('PASS complete ghost sprites composite once at48percent opacity',ghost);
  const immediateSave=await ev(`(async()=>{
    hearthReset();hearthFireGPU=FireWGPU.create({device:testDevice,width:96,worldWidth:HEARTH_WIDTH,headroom:-HEARTH_TOP});await hearthFireGPU.readyPromise;
    const b=hearthAddChunk('boiler',448,165);b.moisture=0;hearthFireTick(1/60);await testDevice.queue.onSubmittedWorkDone();await new Promise(r=>setTimeout(r,0));
    const before=b.surfaceKelvin;hearthLightChunk(hearthBeds.boiler,b);const saved=hearthSave(),pending=saved.boiler.chunks[0].ignitionPending;
    hearthRestore(saved);const restored=hearthBeds.boiler.chunks[0];
    for(let i=0;i<32;i++){hearthFireTick(1/60);await testDevice.queue.onSubmittedWorkDone();await new Promise(r=>setTimeout(r,0));}
    const result={before,pending,replayed:!restored.restoreIgnition,acknowledged:!restored.ignitionPending,core:restored.coreKelvin,fuel:restored.fuel};
    hearthFireGPU.dispose();hearthFireGPU=null;return result;
  })()`);
  assert(immediateSave.before===300 && immediateSave.pending && immediateSave.replayed && immediateSave.acknowledged && immediateSave.core>800 && immediateSave.fuel<1,JSON.stringify(immediateSave));
  console.log('PASS save immediately after a spark replays its unacknowledged GPU ignition once',immediateSave);
  assert.equal(errors.length,0);console.log('PASS six catalog materials on actual GPU, finite fields and real heat differences');
}finally{try{ws?.close();}catch{}chrome?.kill();server.close();fs.rmSync(profile,{recursive:true,force:true});}
