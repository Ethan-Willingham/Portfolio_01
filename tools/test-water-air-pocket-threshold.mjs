#!/usr/bin/env node
// Actual pressure-module GPU regression for a sealed pocket losing its air core.
// Dedicated Chrome for Testing child is closed in finally. No native particles
// are moved: prescribed mass fractions isolate topology, remapping and pressure.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourcePath=path.resolve(process.env.AIR_SOURCE || path.join(root,'js/liquid-air-wgpu.js'));
const source=fs.readFileSync(sourcePath,'utf8');
const sourceSHA256=createHash('sha256').update(source).digest('hex');
const macPath=path.resolve(process.env.MAC_SOURCE || path.join(root,'js/liquid-air-mac-wgpu.js'));
const macSource=fs.readFileSync(macPath,'utf8');
const macSHA256=createHash('sha256').update(macSource).digest('hex');
const output=path.resolve(process.env.DUMP || '/tmp/water-air-pocket-threshold');
const port=Number(process.env.PORT || 8553),debug=port+1000;
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-pocket-browser-'));
fs.mkdirSync(output,{recursive:true});
let child,socket,sequence=0;const pending=new Map(),errors=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=createServer((request,response)=>{
  if(request.url==='/air.js'){response.writeHead(200,{'Content-Type':'text/javascript'}).end(source);return;}
  if(request.url==='/mac.js'){response.writeHead(200,{'Content-Type':'text/javascript'}).end(macSource);return;}
  response.writeHead(200,{'Content-Type':'text/html'}).end('<!doctype html><title>Isolated air pocket</title><script src="/mac.js"></script><script src="/air.js"></script>');
});
async function cleanup(){
  try{socket?.close();}catch{}
  server.close();
  if(child && child.exitCode===null && child.signalCode===null){
    const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();
    const force=setTimeout(()=>child.kill('SIGKILL'),2000);await exited;clearTimeout(force);
  }
  for(const p of pending.values())clearTimeout(p.timer);
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
process.on('SIGINT',async()=>{await cleanup();process.exit(130);});
process.on('SIGTERM',async()=>{await cleanup();process.exit(143);});
function send(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},60000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;
}
async function fixture(o){
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter)throw Error('No WebGPU adapter');
  const device=await adapter.requestDevice({requiredLimits:{maxStorageBuffersPerShaderStage:10}});
  const gpuErrors=[];device.addEventListener('uncapturederror',e=>gpuErrors.push(e.error.message));
  const queue=device.queue,width=3,height=3,count=9,center=4,dx=8,dt=1/120;
  const waterNeighbor=center+(o.side===1?1:-1),faceDirection=o.side===1?1:0;
  const flowSign=o.side===1?-1:1;
  const sharedMacFace=Math.floor(center/width)*(width+1)+center%width+(o.side===1?1:0);
  const allocated=[];
  function buffer(size,uniform=false){
    const b=device.createBuffer({size,usage:(uniform?GPUBufferUsage.UNIFORM:GPUBufferUsage.STORAGE)|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
    allocated.push(b);return b;
  }
  const paramsBuf=buffer(64,true),params=new ArrayBuffer(64),pi=new Uint32Array(params),pf=new Float32Array(params);
  pi.set([0,width,height,0,0,count]);pf.set([dt,1/dx,3,dx,3,0],6);queue.writeBuffer(paramsBuf,0,params);
  const instance={device,queue,cellSize:dx,paramsBuf,paramsHostF:pf,grid:{width,height,cells:count},
    simulationClock:0,buf:{cellMass:buffer(count*4),cellVelX:buffer(count*4),cellVelY:buffer(count*4)}};
  if(o.mac){
    instance.simParamsBuf=buffer(16,true);
    for(const name of ['pos','affine','aux','flag'])instance.buf[name]=buffer(16);
    // Prescribe MAC records to isolate the actual transformed pressure shaders.
    // Scatter and particle gather are outside this fixture's acceptance scope.
    const original=LiquidAirMAC.create;
    LiquidAirMAC.create=function(...args){const helper=original(...args);helper.before=function(){};return helper;};
    instance.restoreMacFactory=()=>{LiquidAirMAC.create=original;};
  }
  let model;
  try{
    model=LiquidAirWGPU.create(instance,{width:width*dx,height:height*dx,cellSize:dx,iterations:o.flow!==undefined?128:16,
      atmospherePressure:o.atmosphere || 100000,density:o.rho || 1,soundSpeed:o.sound || 500,
      minimumPressure:-.8*(o.atmosphere || 100000),waterThreshold:o.threshold,geometricGas:true,
      nonlinearGas:!!o.nonlinear,retainSingleMixedGas:!!o.retain,macTransfer:!!o.mac});
    await model.readyPromise;await model.initializeMaterial();model.setEnabled(true);
    const solid=Float32Array.from({length:count},()=>1-o.open),room=new Uint8Array(count),faces=new Float32Array(count*4);
    if(o.neighborCore){faces[center*4+1]=1;faces[(center+1)*4]=1;}
    model.geometry(solid,room,null,null,faces);
    const snapshots=[];
    for(const fraction of o.fractions){
      const flowing=o.flow!==undefined && snapshots.length>0;
      const velocity=flowing?flowSign*o.flow/(dt*dx):0;
      const mass=Int32Array.from({length:count},()=>Math.round(4*o.open*1048576));
      mass[center]=Math.round(4*o.open*fraction*1048576);
      if(o.neighborCore)mass[center+1]=Math.round(4*o.open*.2*1048576);
      if(o.neighborMixed)mass[center+1]=Math.round(4*o.open*fraction*1048576);
      if(o.guard && snapshots.length){
        const before=await model.capture(),changed=Float32Array.from(solid),wall=new Float32Array(count);
        if(o.guard==='geometry')changed[center]+=.125;else wall[center]=1;
        let rejection='';try{model.geometry(changed,room,null,wall,faces);}catch(e){rejection=e.message;}
        if(!rejection)throw Error('Unsupported '+o.guard+' was accepted');
        const after=await model.capture();
        for(const key of ['cells','labels','history','pressure','gas','geometry','phase']){
          const a=new Uint8Array(before[key].buffer),b=new Uint8Array(after[key].buffer);
          if(a.length!==b.length || a.some((v,i)=>v!==b[i]))throw Error('Guard mutated '+key);
        }
        return {config:o,guardRejected:true,inventoryUnchanged:true,rejection,gpuErrors};
      }
      if(o.vented && snapshots.length){room[center]=1;model.geometry(solid,room,null,null,faces);}
      if(flowing){faces[center*4+faceDirection]=1;faces[waterNeighbor*4+(faceDirection^1)]=1;model.geometry(solid,room,null,null,faces);}
      if(o.neighborMixed && snapshots.length){faces[center*4+1]=1;faces[(center+1)*4]=1;model.geometry(solid,room,null,null,faces);}
      queue.writeBuffer(instance.buf.cellMass,0,mass);
      const nativeVelocity=Float32Array.from({length:count},()=>velocity*dt/dx);
      queue.writeBuffer(instance.buf.cellVelX,0,nativeVelocity);
      if(o.mac){
        const records=model.macRecords,faceCount=model.macFaceRecords;
        const bytes=new ArrayBuffer(records*64),mi=new Int32Array(bytes),mf=new Float32Array(bytes);
        for(let q=0;q<records-1;q++){
          const c=q-faceCount,alpha=c===center || o.neighborMixed && c===center+1?fraction:o.neighborCore && c===center+1?.2:1;
          const volume=alpha*o.open*dx*dx;
          mi[q*16]=Math.round(volume*(o.rho || 1)*16384);mi[q*16+2]=Math.round(volume*16384);
          mf[q*16+4]=q<(width+1)*height?velocity:0;
          mf[q*16+5]=o.rho || 1;mf[q*16+6]=o.open*dx*dx;mf[q*16+7]=1;mf[q*16+10]=alpha;
        }
        queue.writeBuffer(model.buffers.mac,0,bytes);
      }
      const encoder=device.createCommandEncoder();model.encode(encoder);queue.submit([encoder.finish()]);
      instance.simulationClock+=dt;
      const s=await model.capture(),bits=new Uint32Array(s.cells.buffer);
      snapshots.push({fraction:s.cells[center*8],kind:bits[center*8+3],airRoot:s.historyInts[center*8+5]>>>0,
        geometricAirVolume:(1-s.cells[center*8])*o.open*dx*dx,
        ...(o.mac?{macDensity:s.mac[(model.macFaceRecords+center)*16+5],macRepresented:new Uint32Array(s.mac.buffer)[(model.macFaceRecords+center)*16+9]}:{}),
        ...(flowing?{pressure:s.pressure[center*4],neighborPressure:s.pressure[waterNeighbor*4],
          gasCompliance:s.cells[center*8+5],oldGasPressure:s.cells[center*8+7],
          integratedGasBase:s.gas[center*16+8]/s.settings.volumeScale,
          oldWaterPressure:0,oldNeighborPressure:s.cells[waterNeighbor*8+7],
          velocityCorrection:s.pressure[center*4+1],
          ...(o.mac?{neighborDensity:s.mac[(model.macFaceRecords+waterNeighbor)*16+5],
            faceDensity:s.mac[sharedMacFace*16+5],projectedFace:s.mac[sharedMacFace*16+8]}:{})}:{}),
        ledger:s.ledger,pockets:s.pockets,convergence:s.convergence});
    }
    await queue.onSubmittedWorkDone();
    if(gpuErrors.length)throw Error(gpuErrors.join('\n'));
    return {config:o,snapshots,gpuErrors};
  }finally{instance.restoreMacFactory?.();model?.destroy();for(const b of allocated)b.destroy();device.destroy();}
}

let report;
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  child=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run',
    '--user-data-dir='+profile,'--remote-debugging-port='+debug,'about:blank'],{stdio:'ignore'});
  let endpoint;
  for(let i=0;i<150;i++){try{endpoint=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(t=>t.type==='page')?.webSocketDebuggerUrl;}catch{}if(endpoint)break;await sleep(100);}
  assert(endpoint,'Owned test browser started');socket=new WebSocket(endpoint);
  await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p?.timer);m.error?p?.reject(m.error):p?.resolve(m.result);}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:'+port});
  let ready=false;for(let i=0;i<100;i++){try{ready=await evaluate('typeof LiquidAirWGPU !== "undefined"');}catch{}if(ready)break;await sleep(100);}
  assert(ready,'Selected module loaded');
  const actual=await evaluate(`(async()=>{const bytes=await(await fetch('/air.js')).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');})()`);
  assert.equal(actual,sourceSHA256,'Exact raw source loaded');
  const actualMac=await evaluate(`(async()=>{const bytes=await(await fetch('/mac.js')).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');})()`);
  assert.equal(actualMac,macSHA256,'Exact raw MAC source loaded');
  const rows=[];
  const run=o=>evaluate('('+fixture.toString()+')('+JSON.stringify(o)+')');
  const near=(a,b)=>assert(Math.abs(a-b)<.003,`${a} versus ${b}`);
  for(const threshold of [.45,.5,.55])for(const open of [.5,.75,1]){
    const row=await run({threshold,open,mac:!!process.env.MAC,retain:!!process.env.EXPECT_RETENTION,fractions:[threshold-.01,threshold+.01,threshold+.01]});
    const [initial,moved,following]=row.snapshots,amount=initial.ledger.newAmount;
    assert(amount>0 && moved.geometricAirVolume>0);assert.equal(initial.kind,2);assert.equal(moved.kind,1);
    if(process.env.EXPECT_RETENTION){
      near(moved.ledger.newAmount,amount);near(following.ledger.newAmount,amount);
      near(moved.ledger.unassignedAmount,0);near(moved.ledger.ventedAmount,0);
      assert(moved.pockets.length===1 && moved.pockets[0].pressure>0,'Retained pocket exerts positive pressure');
    }else{
      near(moved.ledger.unassignedAmount,amount);near(moved.ledger.newAmount,0);near(moved.ledger.balanceError,0);
      near(following.ledger.newAmount,0);near(following.ledger.unassignedAmount,0);
    }
    row.physicalRetentionPass=!!process.env.EXPECT_RETENTION;rows.push(row);
  }
  const controls=[];
  for(const config of [
    {threshold:.45,open:1,fractions:[.44,.445,.445]},
    {threshold:.45,open:1,neighborCore:true,fractions:[.44,.46,.46]},
    {threshold:.45,open:1,vented:true,fractions:[.44,.44,.44]}
  ]){
    const row=await run({...config,mac:!!process.env.MAC,retain:!!process.env.EXPECT_RETENTION}),[initial,moved]=row.snapshots;
    near(moved.ledger.unassignedAmount,0);
    if(config.vented)near(moved.ledger.ventedAmount,initial.ledger.newAmount);
    else near(moved.ledger.newAmount,initial.ledger.newAmount);
    controls.push(row);
  }
  const pressureRows=[];
  if(process.env.PRESSURE){
    assert(process.env.EXPECT_RETENTION,'Pressure closure requires enabled private retention');
    const flows=process.env.PRESSURE_EXTENDED?[-.16,0,1.28]:[1.28],sides=process.env.PRESSURE_EXTENDED?[0,1]:[0];
    for(const nonlinear of [false,true])for(const rho of [1,2])for(const sound of [250,1000])for(const flow of flows)for(const side of sides){
      const config={threshold:.45,open:1,mac:!!process.env.MAC,retain:true,
        fractions:[.44,.46],flow,side,rho,sound,nonlinear,atmosphere:100000};
      const row=await run(config),s=row.snapshots[1],prior=row.snapshots[0];
      const dx=8,dt=1/120,amount=prior.ledger.newAmount,base=s.integratedGasBase,gasOld=(amount/base-1)*config.atmosphere;
      const centerDensity=config.mac?s.macDensity:rho,neighborDensity=config.mac?s.neighborDensity:rho;
      const faceDensity=config.mac?s.faceDensity:rho,k=dt*dt/faceDensity;
      const cw=s.fraction*64/(centerDensity*sound*sound),cn=64/(neighborDensity*sound*sound),cg=base/(config.atmosphere+gasOld);
      const neighbor=p=>(-config.flow+k*p)/(cn+k);
      let expected;
      if(nonlinear){
        // Independent EOS plus liquid compressibility and corrected face flux.
        // Current geometry is the base BEFORE this new provisional inflow.
        const equation=p=>(config.atmosphere+p)*(base-config.flow+k*(p-neighbor(p))+cw*p)-config.atmosphere*amount;
        let lo=-.8*config.atmosphere,hi=1e8;
        assert(equation(lo)<0 && equation(hi)>0);
        for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(equation(mid)>0)hi=mid;else lo=mid;}
        expected=(lo+hi)/2;
      }else{
        // Eliminate the separate ordinary-water pressure from a symmetric
        // two-row matrix. Gas and mixed liquid share one mechanical pressure.
        expected=(config.flow+cg*gasOld-k*config.flow/(cn+k))/(cg+cw+k-k*k/(cn+k));
      }
      const pn=neighbor(expected),incoming=config.flow-k*(expected-pn),gasAfter=base-incoming+cw*expected;
      const close=(a,b,tolerance)=>assert(Math.abs(a-b)<=tolerance*Math.max(1,Math.abs(b)),`${a} versus ${b}`);
      close(s.pressure,expected,.00015);close(s.neighborPressure,pn,.00015);
      close(s.pockets[0].volume,gasAfter,.0001);
      near(s.ledger.newAmount,amount);near(s.ledger.unassignedAmount,0);near(s.ledger.ventedAmount,0);
      const sign=side===1?-1:1,projected=sign*(config.flow/(dt*dx)-dt*(expected-pn)/(faceDensity*dx));
      if(config.mac)close(s.projectedFace,projected,.00015);
      else close(s.velocityCorrection,.5*(projected-2*sign*config.flow/(dt*dx)),.00015);
      if(nonlinear)close((config.atmosphere+s.pressure)*s.pockets[0].volume,config.atmosphere*amount,.0001);
      row.oracle={expectedPressure:expected,expectedNeighborPressure:pn,expectedGasVolume:gasAfter,
        expectedProjectedFace:projected,waterCompliance:cw,neighborCompliance:cn,gasCompliance:cg,coupling:k,pressureForcePass:true};
      pressureRows.push(row);
    }
  }
  const guardRows=[];
  if(process.env.GUARDS){
    assert(process.env.EXPECT_RETENTION,'Guards require enabled private retention');
    for(const guard of ['geometry','movingWall']){
      const row=await run({threshold:.45,open:1,mac:!!process.env.MAC,retain:true,guard,fractions:[.44,.46]});
      assert(row.guardRejected && row.inventoryUnchanged);guardRows.push(row);
    }
    const row=await run({threshold:.45,open:1,mac:!!process.env.MAC,retain:true,neighborMixed:true,fractions:[.44,.46]});
    near(row.snapshots[1].ledger.newAmount,row.snapshots[0].ledger.newAmount);
    near(row.snapshots[1].ledger.unassignedAmount,0);
    assert(row.snapshots[1].ledger.connectivityErrors>0,'Unsupported two-owner face is diagnosed');
    assert.equal(row.snapshots[1].convergence.singleMixedSupported,false);
    assert.equal(row.snapshots[1].convergence.phaseResolved,false);
    guardRows.push(row);
  }
  assert.equal(errors.length,0,errors.join('\n'));
  report={schema:'water-air-pocket-threshold-gpu-v1',testPass:true,physicalRetentionPass:!!process.env.EXPECT_RETENTION,
    fullPhysicalAcceptance:false,sourceSHA256,macSHA256,mac:!!process.env.MAC,rows,controls,pressureRows,guardRows,errors,
    scope:'Actual air module full GPU pressure step chain, with prescribed native mass or MAC records. MAC scatter is bypassed, and particle gather is absent. Sealed stationary cells isolate air-core threshold loss. No moving particles, exact constitutive geometry, broad topology or natural interface motion acceptance.'};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({testPass:true,physicalRetentionPass:report.physicalRetentionPass,cases:rows.length,controls:controls.length,pressureCases:pressureRows.length,guards:guardRows.length,mac:report.mac,sourceSHA256}));
}catch(error){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({sourceSHA256,error:String(error),errors},null,2)+'\n');throw error;}
finally{await cleanup();}
