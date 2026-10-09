#!/usr/bin/env node
// Integrated machine measurements through the real toy and its particle solver.
// DUMP=/absolute/output SEEDS=17 MACHINE=siphon SIM_SECONDS=10 node tools/test-water-machines.mjs
// CASES may be a JSON array of {name,machine,options,seconds,actions}; actions are
// {at,type:'primary'}, {at,type:'slime',x,y,radius}, {at,type:'valve',id,open},
// {at,type:'pressure-floor',value} for a physical column-separation control,
// or {at,type:'observe'} for a passive native-buffer checkpoint.
// Run GPU tests exclusively.
// Diagnostic output distinguishes observations from complete acceptance.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {installNativePairedObserver,serializePairedCapture} from './water-machines-paired-observer.mjs';
import {installNativePassage} from './water-machines-native-passage.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.DUMP || '/tmp/water-machines-integrated');
const seeds=(process.env.SEEDS || '17,42,913').split(',').map(Number);
const seconds=Number(process.env.SIM_SECONDS || 10),sampleInterval=Number(process.env.SAMPLE_SECONDS || .25);
const maxWallSeconds=Number(process.env.MAX_WALL_SECONDS || 900);
const viewport={width:Number(process.env.WIDTH || 1440),height:Number(process.env.HEIGHT || 1000),mobile:process.env.MOBILE==='1'};
const frameMode=process.env.FRAME_MODE || 'paced60';
const pairedMode=process.env.PAIRED_CAPTURE==='1';
const nativePassage=process.env.NATIVE_PASSAGE==='1';
const resume=process.env.RESUME==='1';
const cases=process.env.CASES ? JSON.parse(process.env.CASES) : [{name:'open',machine:process.env.MACHINE || 'siphon',options:{open:true},seconds}];
assert(seeds.length&&seeds.every(Number.isInteger),'Integer deterministic seeds');
assert(cases.length&&cases.every(c=>typeof c.name==='string'&&['siphon','cup','heron'].includes(c.machine)),'Known named cases');
assert(seconds>0&&sampleInterval>0&&maxWallSeconds>0,'Positive durations');
assert(['native','paced60','paced120'].includes(frameMode),'Known scheduling mode');
if(pairedMode)assert(cases.every(c=>c.machine==='siphon'&&!(c.actions || []).length),'Paired mode is a static siphon without mid-run host actions');
assert(!output.startsWith(root+path.sep),'Artifacts belong outside the tracked checkout');
fs.mkdirSync(output,{recursive:true});
const hash=data=>createHash('sha256').update(data).digest('hex');
const frozenPaths=['archive/water-smoke-slime/water-smoke-slime.html','water-smoke-slime.css',
  'js/water-smoke-slime.js','js/water-smoke-slime-ui.js','js/liquid-wgpu.js','js/liquid-air-wgpu.js',
  'js/water-machines-scenes.js','js/water-machines-instruments.js','js/water-machines-builder.js','js/water-rainbow.js',
  'js/liquid-air-model.js'];
const sourceDirectory=process.env.SOURCE_DIR ? path.resolve(process.env.SOURCE_DIR) : null;
if(fs.existsSync(sourceDirectory ? path.join(sourceDirectory,'liquid-air-mac-wgpu.js') : path.join(root,'js/liquid-air-mac-wgpu.js')))
  frozenPaths.push('js/liquid-air-mac-wgpu.js');
const frozen=new Map(frozenPaths.map(file=>[file,fs.readFileSync(sourceDirectory ? path.join(sourceDirectory,path.basename(file)) : path.join(root,file))]));
fs.mkdirSync(path.join(output,'source'),{recursive:true});
for(const [file,data] of frozen){
  const saved=path.join(output,'source',path.basename(file));
  if(resume && fs.existsSync(saved))assert.equal(hash(fs.readFileSync(saved)),hash(data),'Resume uses the same runtime: '+file);
  else fs.writeFileSync(saved,data);
}
const testSources=new Map(['test-water-machines.mjs','water-machines-paired-observer.mjs','water-machines-native-passage.mjs'].map(file=>[file,fs.readFileSync(path.join(root,'tools',file))]));
const testSourceFolder=resume?'source-resume':'source';fs.mkdirSync(path.join(output,testSourceFolder),{recursive:true});
for(const [file,data]of testSources)fs.writeFileSync(path.join(output,testSourceFolder,file),data);

function installCadence(hz){
  const native=window.requestAnimationFrame.bind(window),callbacks=new Map(),period=1000/hz;
  let serial=0,pumping=false,deadline=null;
  window.__machineCadence={hz,presentationCertified:false,missedSlots:0,ticks:0};
  function pump(time){
    if(!callbacks.size){pumping=false;deadline=null;return;}
    if(deadline===null)deadline=time;
    if(time+.05<deadline){native(pump);return;}
    const missed=Math.floor(Math.max(0,time-deadline)/period);
    window.__machineCadence.missedSlots+=missed;window.__machineCadence.ticks++;
    deadline+=(missed+1)*period;
    for(const [id,callback] of [...callbacks])if(callbacks.get(id)===callback){callbacks.delete(id);callback(time);}
    if(callbacks.size)native(pump);else{pumping=false;deadline=null;}
  }
  window.requestAnimationFrame=callback=>{const id=++serial;callbacks.set(id,callback);if(!pumping){pumping=true;native(pump);}return id;};
  window.cancelAnimationFrame=id=>callbacks.delete(id);
}

function installMeasurements(measurementConfig={}){
  const T=window.__toy,L=T.liquid(),state=T.machineState(),definition=state.definition,I=window.WaterMachinesInstruments;
  const meter=definition.meters[0],source=definition.measure.source,receiver=definition.measure.receiver;
  const count=L.liquid.getCount(),arrays=L.liquid.arrays;
  const sourceIds=new Set(),inclusiveSourceIds=new Set(),crossed=new Set(),arrived=new Set(),crossingEvents=[],particlePaths=[],outletEvents=[],outletPassed=new Set();
  const tile=T.world().tile,pipeInterior=new Set();
  for(const pipe of definition.pipes || []){
    const across=Math.ceil(pipe.bore/tile),low=Math.floor((across-1)/2),high=across-1-low;
    const add=(c0,c1,r0,r1)=>{for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++)pipeInterior.add(c+','+r);};
    const points=pipe.points.map(p=>({c:Math.floor(p.x/tile),r:Math.floor(p.y/tile)}));
    for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j];add(a.c===b.c?a.c-low:Math.min(a.c,b.c),a.c===b.c?a.c+high:Math.max(a.c,b.c),a.r===b.r?a.r-low:Math.min(a.r,b.r),a.r===b.r?a.r+high:Math.max(a.r,b.r));}
    for(const p of points.slice(1,-1))add(p.c-low,p.c+high,p.r-low,p.r+high);
  }
  const endpoint=definition.pipes?.[0]?.points?.at(-1),previousPoint=definition.pipes?.[0]?.points?.at(-2),mouth=definition.measure.outlet;
  const outlet=mouth&&endpoint&&previousPoint?(()=>{const axis=endpoint.x===previousPoint.x?'y':'x',across=Math.ceil(definition.pipes[0].bore/tile),low=Math.floor((across-1)/2),center=Math.floor((axis==='y'?endpoint.x:endpoint.y)/tile);
    return {axis,face:axis==='y'?mouth.y:mouth.x,positive:Math.sign(axis==='y'?endpoint.y-previousPoint.y:endpoint.x-previousPoint.x),alongMin:(center-low)*tile,alongMax:(center-low+across)*tile,mouth};})():null;
  const inPipe=(px,py)=>pipeInterior.has(Math.floor(px/tile)+','+Math.floor(py/tile));
  const x=new Float32Array(count),y=new Float32Array(count);
  const inside=(i,rect)=>rect&&arrays.x[i]>=rect.x+T.world().tile&&arrays.x[i]<rect.x+rect.width-T.world().tile&&
    arrays.y[i]>=rect.y&&arrays.y[i]<rect.y+rect.height-T.world().tile;
  for(let i=0;i<count;i++){x[i]=arrays.x[i];y[i]=arrays.y[i];if(inside(i,source)){inclusiveSourceIds.add(i);if(!inPipe(x[i],y[i]))sourceIds.add(i);}}
  const bulkIds=Array.from(sourceIds),pathIds=bulkIds.filter((id,k)=>k%Math.max(1,Math.ceil(bulkIds.length/64))===0);
  const sourceOrigin={definition:'Initial particle centers inside the source vessel, excluding its one-tile side/floor walls and every exact declared pipe interior tile. This independently reconstructs the builder segment rectangles, complete bore-sized bend squares and asymmetric even-tile bore intervals. Tube primer particles in those tiles are excluded.',
    inclusiveVesselCount:inclusiveSourceIds.size,bulkTankCount:sourceIds.size,excludedPipePrimerCount:inclusiveSourceIds.size-sourceIds.size,
    bulkIds,pathIds,pipeInteriorTiles:Array.from(pipeInterior),outletDefinition:outlet,pathSampling:'Up to 64 evenly indexed initial bulk tank IDs at every applied mirror, plus every bulk-ID crest crossing event. Full initial and final resident particle buffers are saved separately.'};
  let lastGeneration=L.readbackApplyGen,lastTime=L.readbackAppliedTime,forward=0,backward=0,finiteFailures=0,minCount=count,maxCount=count;
  const data=window.__machineMeasurement={rows:[],intervals:[],maps:[],actions:[],pressureSnapshots:[],initialCount:count,
    initialSourceCount:sourceIds.size,sourceOrigin,initialReceiverCount:I.vessel({count,x:arrays.x,y:arrays.y},receiver || {x:0,y:0,width:0,height:0},{tile:T.world().tile}).count,
    startedAt:performance.now(),startSimulation:state.startedAt,finished:false,sourceIds:sourceIds.size};
  const original=L.update.bind(L);
  L.update=function(dt){data.intervals.push({wall:performance.now()-data.startedAt,dt,simulation:L.simulationClock});return original(dt);};
  for(const [key,buffer] of Object.entries(L.rb || {})){
    const original=buffer.mapAsync.bind(buffer);
    buffer.mapAsync=function(){const start=performance.now(),promise=original(...arguments);promise.then(()=>data.maps.push({buffer:key,at:performance.now()-data.startedAt,latencyMs:performance.now()-start}),()=>{});return promise;};
  }
  const model=T.airModel(),originalCapture=model.capture.bind(model);let pressureStep=-1;
  window.__machineMACSummary=function(snapshot){
    if(!snapshot.mac)return null;const values=snapshot.mac,bits=new Int32Array(values.buffer,values.byteOffset,values.length),
      unsigned=new Uint32Array(values.buffer,values.byteOffset,values.length),stride=snapshot.macStride || 16,
      u=(snapshot.width+1)*snapshot.height,v=snapshot.width*(snapshot.height+1),n=snapshot.width*snapshot.height;
    if(stride!==16||values.length!==(u+v+n+1)*stride)throw Error('Unknown MAC record ABI');
    const sections={};for(const [name,start,end]of [['u',0,u],['v',u,u+v],['centers',u+v,u+v+n]]){
      let represented=0,invalid=0,minimumDensity=Infinity,maximumDensity=-Infinity,minimumJ=Infinity,maximumJ=-Infinity,
        minimumAlpha=Infinity,maximumAlpha=-Infinity,maxDefect=0,maxSpeed=0,mass=0,materialVolume=0;
      for(let q=start;q<end;q++){const at=q*stride;mass+=bits[at]/16384;materialVolume+=bits[at+2]/16384;
        if(![values[at+4],values[at+5],values[at+6],values[at+7],values[at+8],values[at+10],values[at+11]].every(Number.isFinite))invalid++;
        if(unsigned[at+9]){represented++;minimumDensity=Math.min(minimumDensity,values[at+5]);maximumDensity=Math.max(maximumDensity,values[at+5]);minimumJ=Math.min(minimumJ,values[at+7]);maximumJ=Math.max(maximumJ,values[at+7]);minimumAlpha=Math.min(minimumAlpha,values[at+10]);maximumAlpha=Math.max(maximumAlpha,values[at+10]);maxDefect=Math.max(maxDefect,values[at+11]);maxSpeed=Math.max(maxSpeed,Math.abs(values[at+8]));}}
      sections[name]={start,end,represented,invalid,mass,materialVolume,minimumDensity:represented?minimumDensity:null,maximumDensity:represented?maximumDensity:null,minimumJ:represented?minimumJ:null,maximumJ:represented?maximumJ:null,minimumAlpha:represented?minimumAlpha:null,maximumAlpha:represented?maximumAlpha:null,maxDefect,maxSpeed};}
    return {stride,records:u+v+n+1,uRecords:u,vRecords:v,centerRecords:n,sections,diagnostics:snapshot.macDiagnostics,
      definition:'Raw64-byte records: int32 mass/16384,momentum/1024,materialVolume/16384,error; f32 provisionalVelocity,density,basis,J,projectedVelocity; u32 represented; f32 alpha,oversaturation,interfaceApproximation,spare3. U/V/center sums repeat each parcel in separate bases and are not added together. Legacy fine mass is diagnostic only.'};
  };
  window.__machineMaterialFromResident=function(pos,aux,flags){
    const x=[],y=[],vx=[],vy=[],density=[];
    for(let i=0;i<flags.length;i++){if(((flags[i]&3)|((flags[i]>>4)&4))!==0)continue;x.push(pos[i*4]);y.push(pos[i*4+1]);vx.push(pos[i*4+2]);vy.push(pos[i*4+3]);density.push(aux[i*4]);}
    const nativeGravity=L.getSimParam('GRAVITY'),particles={count:x.length,x,y,vx,vy,density,time:L.simulationClock},rho=model.settings.density || 1;
    let material=null,materialError=null;
    if(model.settings.constitutiveLaw==='density-linear')try{material=I.materialEnergy(particles,{density:rho,soundSpeed:model.settings.soundSpeed});}catch(error){materialError=error.message;}
    return {simulationTime:L.simulationClock,waterCount:x.length,excludedNonWater:flags.length-x.length,materialInitialized:model.settings.constitutiveLaw==='density-linear',material,materialError,
      mechanical:I.waterEnergy(particles,{floor:T.world().h,gravity:nativeGravity,density:rho}),
      nativeParams:Object.fromEntries(['GRAVITY','TIMESCALE','MAX_VEL','BURST_DAMP','AIR_DRAG'].map(name=>[name,L.getSimParam(name) ?? null])),
      definition:'Exact copied water-type resident particles at the held native clock. Material compression uses carried aux.x; mechanical energy uses constant parcel mass. Nonwater types are excluded. Each original binary remains authoritative.'};
  };
  function tube(snapshot){
    const bits=new Uint32Array(snapshot.cells.buffer,snapshot.cells.byteOffset,snapshot.cells.length);
    return (definition.pipes || []).map(pipe=>({id:pipe.id,bends:pipe.points.map(p=>({point:p,cell:I.cell(snapshot,p.x,p.y)})),segments:pipe.points.slice(1).map((b,segment)=>{
      const a=pipe.points[segment],horizontal=a.y===b.y,lo=horizontal?Math.min(a.x,b.x):Math.min(a.y,b.y),hi=horizontal?Math.max(a.x,b.x):Math.max(a.y,b.y);
      let water=0,air=0,solid=0,minimumPressure=Infinity,maximumPressure=-Infinity,minimumFraction=Infinity,maximumFraction=-Infinity;
      for(let along=lo+snapshot.cellSize*.5;along<hi;along+=snapshot.cellSize){
        const col=Math.max(0,Math.min(snapshot.width-1,Math.floor((horizontal?along:a.x)/snapshot.cellSize)));
        const row=Math.max(0,Math.min(snapshot.height-1,Math.floor((horizontal?a.y:along)/snapshot.cellSize))),i=row*snapshot.width+col;
        const kind=bits[i*8+3];if(kind===1){water++;minimumPressure=Math.min(minimumPressure,snapshot.pressure[i*4]);maximumPressure=Math.max(maximumPressure,snapshot.pressure[i*4]);}else if(kind===2)air++;else solid++;
        minimumFraction=Math.min(minimumFraction,snapshot.cells[i*8]);maximumFraction=Math.max(maximumFraction,snapshot.cells[i*8]);
      }
      return {segment,a,b,waterCenterCells:water,airCenterCells:air,solidCenterCells:solid,minimumFraction,maximumFraction,
        minimumWaterPressure:water?minimumPressure:null,maximumWaterPressure:water?maximumPressure:null,
        midpoint:I.cell(snapshot,(a.x+b.x)*.5,(a.y+b.y)*.5)};
    })}));
  }
  model.capture=function(){
    const promise=originalCapture(...arguments);
    promise.then(snapshot=>{
      if(!snapshot||snapshot.steps===pressureStep)return;pressureStep=snapshot.steps;
      const probes={};
      for(const key of ['source','bottom','basin','receiver']){
        const vessel=definition.measure[key];if(!vessel)continue;
        probes[key+'Air']=I.cell(snapshot,vessel.x+T.world().tile*2.5,vessel.y+T.world().tile*2.5);
      }
      data.pressureSnapshots.push({simulationSeconds:snapshot.simulationTime-state.startedAt,steps:snapshot.steps,
        latencyMs:snapshot.latencyMs,ledger:snapshot.ledger,phaseLedger:snapshot.phaseLedger,convergence:snapshot.convergence,
        macDiagnostics:snapshot.macDiagnostics ?? null,mac:window.__machineMACSummary(snapshot),
        zeroMassRetainedCells:(()=>{const bits=new Uint32Array(snapshot.cells.buffer),pbits=snapshot.phase?new Uint32Array(snapshot.phase.buffer):null,out=[];for(let i=0;i<snapshot.width*snapshot.height;i++)if(bits[i*8+3]===1&&snapshot.cells[i*8]<1e-6)out.push({index:i,x:(i%snapshot.width+.5)*snapshot.cellSize,y:(Math.floor(i/snapshot.width)+.5)*snapshot.cellSize,fraction:snapshot.cells[i*8],pressure:snapshot.pressure[i*4],phaseStatus:pbits?.[i*4+2] ?? null,expansion:snapshot.phase?.[i*4] ?? null});return out;})(),pockets:snapshot.pockets,probes,tube:tube(snapshot)});
    },()=>{});
    return promise;
  };
  function sample(){
    const now=L.simulationClock-state.startedAt,n=L.liquid.getCount();minCount=Math.min(minCount,n);maxCount=Math.max(maxCount,n);
    let invalid=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,maxSpeed=0,reservoirParticles=0;
    for(let i=0;i<n;i++){
      const px=arrays.x[i],py=arrays.y[i],vx=arrays.vx[i],vy=arrays.vy[i];
      if(!Number.isFinite(px)||!Number.isFinite(py)||!Number.isFinite(vx)||!Number.isFinite(vy)){invalid++;continue;}
      minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);maxSpeed=Math.max(maxSpeed,Math.hypot(vx,vy));
    }
    finiteFailures+=invalid;
    for(let i=0;i<n;i++)if(inside(i,source)&&!inPipe(arrays.x[i],arrays.y[i]))reservoirParticles++;
    if(L.readbackApplyGen!==lastGeneration){
      for(let i=0;i<Math.min(n,x.length);i++){
        const a=meter.axis==='x'?x[i]-meter.a.x:y[i]-meter.a.y;
        const b=meter.axis==='x'?arrays.x[i]-meter.a.x:arrays.y[i]-meter.a.y;
        if(a*b<0){
          const fraction=a/(a-b),along=meter.axis==='x'?y[i]+(arrays.y[i]-y[i])*fraction:x[i]+(arrays.x[i]-x[i])*fraction;
          const lo=meter.axis==='x'?Math.min(meter.a.y,meter.b.y):Math.min(meter.a.x,meter.b.x);
          const hi=meter.axis==='x'?Math.max(meter.a.y,meter.b.y):Math.max(meter.a.x,meter.b.x);
          if(along>=lo&&along<=hi){if((b-a)*(meter.positive || 1)>0){forward++;if(sourceIds.has(i)){crossed.add(i);crossingEvents.push({id:i,simulationSeconds:now,mirrorTime:L.readbackAppliedTime,from:{x:x[i],y:y[i]},to:{x:arrays.x[i],y:arrays.y[i]},along});}}else backward++;}
        }
        if(outlet&&sourceIds.has(i)&&crossed.has(i)){
          const a=(outlet.axis==='y'?y[i]:x[i])-outlet.face,b=(outlet.axis==='y'?arrays.y[i]:arrays.x[i])-outlet.face;
          if(a*outlet.positive<=0&&b*outlet.positive>0){const f=a/(a-b),along=outlet.axis==='y'?x[i]+(arrays.x[i]-x[i])*f:y[i]+(arrays.y[i]-y[i])*f;
            if(along>=outlet.alongMin&&along<outlet.alongMax){outletPassed.add(i);outletEvents.push({id:i,simulationSeconds:now,mirrorTime:L.readbackAppliedTime,from:{x:x[i],y:y[i]},to:{x:arrays.x[i],y:arrays.y[i]},along});}}
        }
        if(sourceIds.has(i)&&crossed.has(i)&&(!outlet||outletPassed.has(i))&&inside(i,receiver)&&!inPipe(arrays.x[i],arrays.y[i]))arrived.add(i);
        x[i]=arrays.x[i];y[i]=arrays.y[i];
      }
      particlePaths.push({simulationSeconds:now,mirrorTime:L.readbackAppliedTime,generation:L.readbackApplyGen,particles:pathIds.map(i=>({id:i,x:arrays.x[i],y:arrays.y[i],vx:arrays.vx[i],vy:arrays.vy[i]}))});
      lastGeneration=L.readbackApplyGen;lastTime=L.readbackAppliedTime;
    }
    return {simulationSeconds:now,wallSeconds:(performance.now()-data.startedAt)/1000,
      count:n,finiteCount:n-invalid,invalid,mirrorGeneration:L.readbackApplyGen,mirrorTime:lastTime,
      mirrorAgeSeconds:L.getReadbackAge(),simActive:L.simActive,readbackPending:L.readbackPending,
      bounds:{minX,maxX,minY,maxY},maximumMirrorSpeed:maxSpeed,
      reservoirVolume:measurementConfig.freeSourceWidth?{spatialBulkCount:reservoirParticles,particleArea:measurementConfig.particleArea || 1.5625,
        area:reservoirParticles*(measurementConfig.particleArea || 1.5625),freeStorageWidth:measurementConfig.freeSourceWidth,
        sourceSurface:source.y+source.height-tile-reservoirParticles*(measurementConfig.particleArea || 1.5625)/measurementConfig.freeSourceWidth,
        head:definition.measure.outlet.y-(source.y+source.height-tile-reservoirParticles*(measurementConfig.particleArea || 1.5625)/measurementConfig.freeSourceWidth),
        method:'Spatial source water count outside exact pipe interior tiles times preregistered rest particle area, divided by declared free reservoir storage width. A measured rest-volume estimate; compression and waves remain limitations.'}:null,
      independentCrossings:{forwardParticles:forward,backwardParticles:backward,netParticles:forward-backward,
        sourceParticlesCrossed:crossed.size,sourceParticlesExitedOutlet:outletPassed.size,sourceParticlesCaptured:arrived.size,
        limitation:'Index tracking requires stable existing particle indices. Appended user water is excluded from initial source IDs; removals or compaction invalidate tracking. Straight-line paths between mirrors miss sub-sample reversals.'},
      instruments:JSON.parse(JSON.stringify(T.instruments())),air:T.airStats()};
  }
  data.particlePaths=particlePaths;data.crossingEvents=crossingEvents;data.outletEvents=outletEvents;data.sample=sample;data.summary=()=>({minCount,maxCount,finiteFailures,sourceCrossed:crossed.size,sourceCaptured:arrived.size,
    firstAppliedMirror:lastTime,forwardParticles:forward,backwardParticles:backward,sourceCapturedIds:Array.from(arrived)});
  data.tick=()=>{if(data.finished)return;data.latest=sample();requestAnimationFrame(data.tick);};
  requestAnimationFrame(data.tick);
  return {definition,world:T.world(),stats:T.stats(),air:T.airStats(),settings:T.airModel().settings,
    simulationParams:Array.from(L.simParamsHost),initialGridParams:Array.from(L.paramsHostF || []),
    nativeParams:Object.fromEntries(['GRAVITY','TIMESCALE','MAX_VEL','BURST_DAMP','AIR_DRAG'].map(name=>[name,L.getSimParam(name) ?? null])),
    initial:sample(),initialCount:count,initialSourceCount:sourceIds.size,sourceOrigin,initialReceiverCount:data.initialReceiverCount};
}

async function residentSnapshot(){
  const instance=__toy.liquid(),count=instance.uploadedCount;
  window.__machineResidentStage='queue';
  await instance.queue.onSubmittedWorkDone();
  const sizes={pos:count*16,affine:count*16,aux:count*16,flag:count*4};
  const buffers=[],encoder=instance.device.createCommandEncoder({label:'machine.measurement'});
  try{
    for(const [key,size] of Object.entries(sizes)){
      const buffer=instance.device.createBuffer({label:'machine.read.'+key,size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      buffers.push({key,buffer,size});encoder.copyBufferToBuffer(instance.buf[key],0,buffer,0,size);
    }
    window.__machineResidentStage='map';instance.queue.submit([encoder.finish()]);
    await Promise.race([Promise.all(buffers.map(({buffer})=>buffer.mapAsync(GPUMapMode.READ))),
      new Promise((_,reject)=>setTimeout(()=>reject(Error('Resident map exceeds 15 seconds')),15000))]);
    window.__machineResidentStage='encode';
    const records={},views={};let invalid=0,maxSpeed=0;
    let floats;
    for(const {key,buffer} of buffers){
      const range=buffer.getMappedRange(),bytes=new Uint8Array(range),chunks=[];
      for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
      records[key]=btoa(chunks.join(''));views[key]=key==='flag'?new Uint32Array(range.slice(0)):new Float32Array(range.slice(0));if(key==='pos')floats=views.pos;
    }
    for(let i=0;i<count;i++){if(![floats[i*4],floats[i*4+1],floats[i*4+2],floats[i*4+3]].every(Number.isFinite))invalid++;maxSpeed=Math.max(maxSpeed,Math.hypot(floats[i*4+2],floats[i*4+3]));}
    window.__machineResidentStage='complete';
    const result={count,invalid,maxSpeed,simulationClock:instance.simulationClock,records,
      material:window.__machineMaterialFromResident?.(views.pos,views.aux,views.flag) ?? null};
    window.__machineResidentResult=result;
    return {...result,records:undefined,recordLengths:Object.fromEntries(Object.entries(records).map(([key,data])=>[key,data.length]))};
  }finally{for(const {buffer} of buffers){try{buffer.unmap();}catch{}buffer.destroy();}}
}

async function initialPressureSnapshot(){
  const L=__toy.liquid(),model=__toy.airModel();
  L.update(1/120);await L.queue.onSubmittedWorkDone();
  let s=await model.capture();for(let i=0;!s&&i<100;i++){await new Promise(r=>setTimeout(r,25));s=await model.capture();}
  if(!s)throw Error('First pressure snapshot missing');
  const geometryStride=model.geometryStride || 4,geometryBytes=s.width*s.height*geometryStride*4;
  const geometryRead=L.device.createBuffer({size:geometryBytes,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const encoder=L.device.createCommandEncoder();encoder.copyBufferToBuffer(model.buffers.geometry,0,geometryRead,0,geometryBytes);
  L.queue.submit([encoder.finish()]);await geometryRead.mapAsync(GPUMapMode.READ);
  const geometry=new Float32Array(geometryRead.getMappedRange().slice(0));geometryRead.unmap();geometryRead.destroy();
  const fields={geometry,cells:s.cells,labels:s.labels,history:s.history,pressure:s.pressure,gas:s.gas,...(s.phase?{phase:s.phase}:{}),...(s.mac?{mac:s.mac}:{})},records={};
  for(const [key,array] of Object.entries(fields)){
    const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength),chunks=[];
    for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
    records[key]=btoa(chunks.join(''));
  }
  const m=__toy.machineState().definition.measure,pipe=__toy.machineState().definition.pipes[0],bits=new Uint32Array(s.cells.buffer);
  const crest=[];
  for(let row=Math.max(0,Math.floor((m.crest-25)/s.cellSize));row<=Math.min(s.height-1,Math.floor((m.crest+25)/s.cellSize));row++)
    for(let col=Math.max(0,Math.floor((pipe.points[0].x-25)/s.cellSize));col<=Math.min(s.width-1,Math.floor((pipe.points[2].x+25)/s.cellSize));col++){
      const i=row*s.width+col;crest.push({col,row,x:(col+.5)*s.cellSize,y:(row+.5)*s.cellSize,
        fraction:s.cells[i*8],kind:bits[i*8+3],label:s.labels[i*2],labelPrevious:s.labels[i*2+1],
        solid:geometry[i*geometryStride],roomBoundary:geometry[i*geometryStride+3],
        openFaces:geometryStride>=8?Array.from(geometry.subarray(i*geometryStride+4,i*geometryStride+8)):null,
        pressure:s.pressure[i*4],residual:s.pressure[i*4+3],phase:s.phase?{expansion:s.phase[i*4],priorKind:new Uint32Array(s.phase.buffer)[i*4+1],status:new Uint32Array(s.phase.buffer)[i*4+2],diagnostic:s.phase[i*4+3]}:null});
    }
  const result={steps:s.steps,simulationTime:s.simulationTime,width:s.width,height:s.height,cellSize:s.cellSize,geometryStride,settings:s.settings,
    ledger:s.ledger,phaseLedger:s.phaseLedger,phaseStride:s.phaseStride ?? null,convergence:s.convergence,pockets:s.pockets,crest,records,
    macStride:s.macStride ?? null,macDiagnostics:s.macDiagnostics ?? null,mac:window.__machineMACSummary(s)};
  window.__machineFirstPressure=result;
  return {...result,crest:undefined,records:undefined,crestRows:crest.length,
    recordLengths:Object.fromEntries(Object.entries(records).map(([key,data])=>[key,data.length]))};
}

async function pressureDiagnostics(){
  const model=__toy.airModel();let s=await model.capture();
  for(let i=0;(!s || s.simulationTime<__toy.liquid().simulationClock-1e-6)&&i<100;i++){
    await new Promise(resolve=>setTimeout(resolve,50));s=await model.capture();
  }
  if(!s)return null;
  let invalid=0,wet=0,minPressure=Infinity,maxPressure=-Infinity;
  const bits=new Uint32Array(s.cells.buffer,s.cells.byteOffset,s.cells.length);
  for(let i=0;i<s.width*s.height;i++){
    if(![s.cells[i*8],s.cells[i*8+1],s.cells[i*8+2],s.pressure[i*4],s.pressure[i*4+1],s.pressure[i*4+2],s.pressure[i*4+3]].every(Number.isFinite))invalid++;
    if(bits[i*8+3]===1){wet++;minPressure=Math.min(minPressure,s.pressure[i*4]);maxPressure=Math.max(maxPressure,s.pressure[i*4]);}
  }
  const d=__toy.machineState().definition,m=d.measure,probes={};
  for(const [name,p] of Object.entries({sourceBottom:{x:m.source.x+m.source.width*.5,y:m.source.y+m.source.height-16},
    crest:m.crest===undefined?null:{x:d.meters[0].a.x,y:m.crest},outlet:m.outlet,nozzle:m.nozzle}))
    if(p)probes[name]=window.WaterMachinesInstruments.cell(s,p.x,p.y);
  const records={};
  for(const key of ['cells','labels','history','pressure','gas','geometry','phase','mac']){
    const array=s[key];if(!array?.buffer)continue;
    const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength),chunks=[];
    for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
    records[key]=btoa(chunks.join(''));
  }
  window.__machineFinalPressure={records};
  return {steps:s.steps,simulationTime:s.simulationTime,latencyMs:s.latencyMs,width:s.width,height:s.height,cellSize:s.cellSize,geometryStride:model.geometryStride || 4,phaseStride:s.phaseStride ?? null,ledger:s.ledger,phaseLedger:s.phaseLedger,
    macStride:s.macStride ?? null,macDiagnostics:s.macDiagnostics ?? null,mac:window.__machineMACSummary(s),
    zeroMassRetainedCells:(()=>{const bits=new Uint32Array(s.cells.buffer),pbits=s.phase?new Uint32Array(s.phase.buffer):null,out=[];for(let i=0;i<s.width*s.height;i++)if(bits[i*8+3]===1&&s.cells[i*8]<1e-6)out.push({index:i,x:(i%s.width+.5)*s.cellSize,y:(Math.floor(i/s.width)+.5)*s.cellSize,fraction:s.cells[i*8],pressure:s.pressure[i*4],phaseStatus:pbits?.[i*4+2] ?? null,expansion:s.phase?.[i*4] ?? null});return out;})(),convergence:s.convergence,
    pockets:s.pockets,settings:s.settings,invalidCells:invalid,waterCells:wet,waterPressureMinimum:wet?minPressure:null,
    waterPressureMaximum:wet?maxPressure:null,probes,recordLengths:Object.fromEntries(Object.entries(records).map(([key,data])=>[key,data.length]))};
}

const quantile=(values,q)=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?a[Math.min(a.length-1,Math.floor(q*(a.length-1)))]:null;};
function summarize(run){
  const rows=run.rows,valid=rows.filter(r=>r.instruments.ready),readings=valid.map(r=>r.instruments);
  const last=rows.at(-1),dt=run.finalSimulationSeconds;
  const resident=run.resident;
  const pressureReadings=run.pressureSnapshots?.length?run.pressureSnapshots:readings;
  const speeds=readings.map(r=>r.speed),heads=readings.map(r=>r.prediction?.head);
  const ratios=readings.map(r=>r.prediction?.speed>0?r.speed/r.prediction.speed:null);
  const pressure=readings.map(r=>r.pressure),ledgerErrors=pressureReadings.map(r=>r.ledger?.balanceError);
  let steady=null;const stableHeadWindows=[],lastActionTime=Math.max(0,...run.actions.map(a=>a.at));
  for(let first=0;first<valid.length;first++){
    const segment=valid.slice(first).filter(r=>r.simulationSeconds<=valid[first].simulationSeconds+5.15);
    if(segment.at(-1)?.simulationSeconds-valid[first].simulationSeconds<5)continue;
    const h=segment.map(r=>r.instruments.prediction?.head).filter(Number.isFinite);
    if(!h.length||Math.min(...h)<=0||(Math.max(...h)-Math.min(...h))/Math.min(...h)>=.1)continue;
    const v=segment.map(r=>r.instruments.speed),ratio=segment.map(r=>r.instruments.prediction?.speed>0?r.instruments.speed/r.instruments.prediction.speed:null).filter(Number.isFinite);
    const window={start:segment[0].simulationSeconds,end:segment.at(-1).simulationSeconds,headMin:Math.min(...h),headMax:Math.max(...h),
      relativeHeadChange:(Math.max(...h)-Math.min(...h))/Math.min(...h),meanSpeed:v.reduce((a,b)=>a+b,0)/v.length,
      meanRatio:ratio.length?ratio.reduce((a,b)=>a+b,0)/ratio.length:null,afterLastAction:segment[0].simulationSeconds>=lastActionTime};
    window.speedCriterion=window.meanRatio!==null&&window.meanRatio>=.35&&window.meanRatio<=1.15;
    stableHeadWindows.push(window);if(!steady&&window.afterLastAction&&window.speedCriterion)steady=window;
  }
  let fixedSteadyWindow=null;
  if(run.measurement?.steadyWindowAfterOpen){
    const opening=run.actions.find(a=>a.action.type==='primary')?.at ?? 0,[a,b]=run.measurement.steadyWindowAfterOpen,start=opening+a,end=opening+b;
    const bracket=(time,get)=>{const before=[...rows].reverse().find(r=>r.simulationSeconds<=time),after=rows.find(r=>r.simulationSeconds>=time);if(!before||!after)return null;const va=get(before),vb=get(after),dt=after.simulationSeconds-before.simulationSeconds;return Number.isFinite(va)&&Number.isFinite(vb)?(dt?va+(vb-va)*(time-before.simulationSeconds)/dt:va):null;};
    const segment=rows.filter(r=>r.simulationSeconds>=start&&r.simulationSeconds<=end),getHead=r=>r.reservoirVolume?.head;
    const headStart=bracket(start,getHead),headEnd=bracket(end,getHead),ratioStart=bracket(start,r=>r.instruments.prediction?.speed>0?r.instruments.speed/r.instruments.prediction.speed:null),ratioEnd=bracket(end,r=>r.instruments.prediction?.speed>0?r.instruments.speed/r.instruments.prediction.speed:null);
    const values=[{t:start,v:ratioStart},...segment.map(r=>({t:r.simulationSeconds,v:r.instruments.prediction?.speed>0?r.instruments.speed/r.instruments.prediction.speed:null})),{t:end,v:ratioEnd}];let integral=0;
    for(let i=1;i<values.length;i++)integral+=(values[i].t-values[i-1].t)*(values[i].v+values[i-1].v)*.5;
    fixedSteadyWindow={relativeToOpening:[a,b],opening,start,end,covered:headStart!==null&&headEnd!==null&&ratioStart!==null&&ratioEnd!==null,
      volumeHeadStart:headStart,volumeHeadEnd:headEnd,volumeHeadRelativeChange:headStart>0?(headStart-headEnd)/headStart:null,
      volumeHeadRange:segment.length?{min:quantile(segment.map(getHead),0),max:quantile(segment.map(getHead),1)}:null,
      quantizedHeadStart:bracket(start,r=>r.instruments.prediction?.head),quantizedHeadEnd:bracket(end,r=>r.instruments.prediction?.head),
      quantizedHeadRange:{min:quantile(segment.map(r=>r.instruments.prediction?.head),0),max:quantile(segment.map(r=>r.instruments.prediction?.head),1)},
      meanSpeedRatio:integral/(end-start),measurement:'Fixed preregistered interval; endpoint values linearly interpolate bracketing observations. Rest-volume level and quantized level are reported separately; neither alters the simulation.'};
  }
  const finalBytes=fs.readFileSync(path.join(output,resident.buffers.pos.file)),receiver=run.initial.definition.measure.receiver,tile=run.initial.world.tile;
  const crossedIds=new Set(run.crossingEvents.map(e=>e.id)),exitedIds=new Set(run.outletEvents.map(e=>e.id)),pipeTiles=new Set(run.initial.sourceOrigin.pipeInteriorTiles),outlet=run.initial.sourceOrigin.outletDefinition,residentBulkReceiverIds=[],residentRectangleIds=[];
  for(const id of run.initial.sourceOrigin.bulkIds){const x=finalBytes.readFloatLE(id*16),y=finalBytes.readFloatLE(id*16+4);
    if(receiver&&x>=receiver.x+tile&&x<receiver.x+receiver.width-tile&&y>=receiver.y&&y<receiver.y+receiver.height-tile){residentRectangleIds.push(id);
      if(!pipeTiles.has(Math.floor(x/tile)+','+Math.floor(y/tile)))residentBulkReceiverIds.push(id);}}
  const capturedIds=new Set(run.tracking.sourceCapturedIds || []);for(const id of residentBulkReceiverIds)if(crossedIds.has(id)&&(!outlet||exitedIds.has(id)))capturedIds.add(id);
  const captured=capturedIds.size,fraction=captured/run.initial.initialSourceCount;
  const intentionalAdded=run.actions.reduce((sum,a)=>sum+Math.max(0,a.afterParticles-a.beforeParticles),0);
  const expectedParticles=run.initial.initialCount+intentionalAdded;
  const conservation=resident.count===expectedParticles&&run.tracking.minCount===run.initial.initialCount&&run.tracking.maxCount===expectedParticles;
  const observationPauseWallSeconds=run.actions.reduce((sum,a)=>sum+(a.observationPauseWallSeconds || 0),0),activeWallSeconds=run.wallSeconds-observationPauseWallSeconds;
  return {recorded:true,simulatedSeconds:dt,wallSeconds:run.wallSeconds,observationPauseWallSeconds,activeWallSeconds,
    simulationSecondsPerWallSecond:dt/activeWallSeconds,realizedUpdatesPerWallSecond:run.intervals.length/activeWallSeconds,
    presentationCertified:false,updates:run.intervals.length,
    callbackIntervalMs:{p50:quantile(run.intervals.slice(1).map((r,i)=>r.wall-run.intervals[i].wall),.5),p95:quantile(run.intervals.slice(1).map((r,i)=>r.wall-run.intervals[i].wall),.95)},
    positionMapLatencyMs:{p50:quantile(run.maps.filter(m=>m.buffer==='pos').map(m=>m.latencyMs),.5),p95:quantile(run.maps.filter(m=>m.buffer==='pos').map(m=>m.latencyMs),.95)},
    mirrorAgeSimulationMs:{p50:quantile(rows.map(r=>r.mirrorAgeSeconds*1000),.5),p95:quantile(rows.map(r=>r.mirrorAgeSeconds*1000),.95)},
    initialParticles:run.initial.initialCount,intentionalParticleAdditions:intentionalAdded,expectedFinalParticles:expectedParticles,
    finalResidentParticles:resident.count,countConserved:conservation,
    allMirrorParticlesFinite:run.tracking.finiteFailures===0,allResidentPositionsVelocitiesFinite:resident.invalid===0,
    sourceParticlesCrossed:last.independentCrossings.sourceParticlesCrossed,sourceParticlesCaptured:captured,
    mirrorSourceParticlesCaptured:last.independentCrossings.sourceParticlesCaptured,finalResidentBulkSourceIDsInReceiverRectangle:residentRectangleIds,finalResidentBulkSourceIDsInReceiver:residentBulkReceiverIds,
    sourceParticlesExitedOutlet:exitedIds.size,sourceOutletPassageDefinition:outlet,
    finalResidentBulkSourceIDsInReceiverWithRecordedCrestCrossing:residentBulkReceiverIds.filter(id=>crossedIds.has(id)),
    finalResidentBulkReceiverIDsWithCrestAndOutletPassage:residentBulkReceiverIds.filter(id=>crossedIds.has(id)&&(!outlet||exitedIds.has(id))),
    sourceFractionThroughCrestCaptured:fraction,finalReceiverCount:last.instruments.water?.receiver?.count ?? null,
    receiverCountIncrease:(last.instruments.water?.receiver?.count ?? run.initial.initialReceiverCount)-run.initial.initialReceiverCount,
    meterSpeed:{min:quantile(speeds,0),p50:quantile(speeds,.5),max:quantile(speeds,1)},
    measuredHead:{min:quantile(heads,0),max:quantile(heads,1)},
    measuredSpeedToIdealRatio:{p50:quantile(ratios,.5),min:quantile(ratios,0),max:quantile(ratios,1)},
    pressureAtMeter:{min:quantile(pressure,0),max:quantile(pressure,1)},
    ledgerMaximumAbsoluteBalanceError:Math.max(0,...ledgerErrors.filter(Number.isFinite).map(Math.abs)),
    maximumUnassignedGasAmount:quantile(pressureReadings.map(r=>r.ledger?.unassignedAmount),1),
    maximumAbsoluteGeometryVolumeDrift:quantile(pressureReadings.map(r=>Math.abs(r.ledger?.geometryVolumeDrift)),1),
    maximumWaterPressureError:quantile(pressureReadings.map(r=>r.convergence?.waterPressureError),1),
    maximumGasPressureError:quantile(pressureReadings.map(r=>r.convergence?.gasPressureError),1),
    maximumWaterResidual:quantile(pressureReadings.map(r=>r.convergence?.waterResidual),1),
    maximumGasResidual:quantile(pressureReadings.map(r=>r.convergence?.gasResidual),1),
    maximumWaterFloorVolume:quantile(pressureReadings.map(r=>r.convergence?.waterFloorVolume),1),
    maximumGasFloorVolume:quantile(pressureReadings.map(r=>r.convergence?.gasFloorVolume),1),
    maximumConnectivityErrors:quantile(pressureReadings.map(r=>r.ledger?.connectivityErrors),1),
    maximumOverflowErrors:quantile(pressureReadings.map(r=>r.ledger?.overflowErrors),1),
    maximumNonpositiveGasVolumes:quantile(pressureReadings.map(r=>r.ledger?.nonpositiveVolumes),1),
    maximumVaporPockets:quantile(pressureReadings.map(r=>r.ledger?.vaporPockets),1),
    cavitationResolvedInEveryReading:pressureReadings.length>0&&pressureReadings.every(r=>r.convergence?.cavitationResolved),
    stableHeadWindows,steadyFiveSecondWindow:steady,fixedSteadyWindow,
    maximumUnresolvedVoidVolume:quantile(pressureReadings.map(r=>r.phaseLedger?.unresolvedVoidVolume),1),
    maximumZeroMassRetainedCells:quantile(pressureReadings.map(r=>r.phaseLedger?.zeroMassRetainedCells),1),
    phaseResolvedInEveryReading:pressureReadings.length>0&&pressureReadings.every(r=>r.convergence?.phaseResolved),
    macRequested:!!run.initial.settings.macTransfer,
    maximumMACInvalidMaterialUpdates:quantile(pressureReadings.map(r=>r.macDiagnostics?.invalidMaterialUpdates),1),
    maximumMACOverflowErrors:quantile(pressureReadings.map(r=>r.macDiagnostics?.overflowErrors),1),
    maximumMACRankZeroComponents:quantile(pressureReadings.map(r=>r.macDiagnostics?.rankZeroComponents),1),
    maximumMACRankOneComponents:quantile(pressureReadings.map(r=>r.macDiagnostics?.rankOneComponents),1),
    maximumMACApproximateInterfaceFaces:quantile(pressureReadings.map(r=>r.macDiagnostics?.interfaceBasisApproximateFaces),1),
    macBasisExactInEveryReading:run.initial.settings.macTransfer?pressureReadings.length>0&&pressureReadings.every(r=>r.macDiagnostics?.geometryBasisExact&&r.macDiagnostics?.interfaceBasisExact):null,
    diagnosticCriteria:{countConserved:conservation,residentFinite:resident.invalid===0,positiveMeterFlow:quantile(readings.map(r=>r.flow),1)>0,
      sourceTransferThroughCrestAtLeastTenPercent:fraction>=.1,
      fixedIntervalCovered:fixedSteadyWindow?fixedSteadyWindow.covered:null,
      fixedIntervalHeadWithinTenPercent:fixedSteadyWindow?fixedSteadyWindow.covered&&fixedSteadyWindow.volumeHeadRelativeChange>=0&&fixedSteadyWindow.volumeHeadRelativeChange<.1:null,
      steadySpeedRatio:fixedSteadyWindow?fixedSteadyWindow.covered&&fixedSteadyWindow.meanSpeedRatio>=.35&&fixedSteadyWindow.meanSpeedRatio<=1.15:(steady?steady.meanRatio>=.35&&steady.meanRatio<=1.15:null)},
    acceptance:'Incomplete. Requires all three seeds and machine-specific variants; diagnostic criteria do not certify the full design.'};
}

const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-machines-integrated-'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer((request,response)=>{
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const artifact=pathname.startsWith('/__machine_artifact/'),relative=artifact?pathname.slice('/__machine_artifact/'.length):pathname.slice(1);
    const base=artifact?output:root,file=path.resolve(base,relative);if(!file.startsWith(base+path.sep)){response.writeHead(403).end();return;}
    const data=artifact?fs.readFileSync(file):(frozen.get(relative)||fs.readFileSync(file));
    response.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
  }catch{response.writeHead(404).end();}
});
let chrome,socket,serial=0;const pending=new Map(),errors=[],logs=[];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},180000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
// Diagnostic arrays can exceed the protocol's nested-object serialization
// limits. Serialize in the page and transfer bounded strings, like raw buffers.
async function evaluateLarge(expression){
  const length=await evaluate(`(()=>{window.__machineExportJSON=JSON.stringify(${expression});return __machineExportJSON.length;})()`);
  assert(Number.isInteger(length)&&length>=0,'Serialized diagnostic length');
  const chunks=[];
  try{
    for(let i=0;i<length;i+=65536)chunks.push(await evaluate(`__machineExportJSON.slice(${i},${i+65536})`));
    return JSON.parse(chunks.join(''));
  }finally{await evaluate('delete window.__machineExportJSON');}
}
async function pullRecords(global,lengths){
  const records={};for(const [key,length] of Object.entries(lengths)){
    const chunks=[];for(let i=0;i<length;i+=65536)chunks.push(await evaluate(`${global}.records[${JSON.stringify(key)}].slice(${i},${i+65536})`));
    records[key]=Buffer.from(chunks.join(''),'base64');
  }return records;
}
function declaredWorldToken(world){
  assert(world&&[world.w,world.h,world.tile].every(Number.isInteger),'Integer declared world');
  assert(world.w%world.tile===0&&world.h%world.tile===0,'Declared world matches tile grid');
  const context=vm.createContext({Buffer,URL});vm.runInContext(frozen.get('js/water-machines-builder.js').toString('utf8'),context);
  return vm.runInContext(`(()=>{const width=${world.w/world.tile},height=${world.h/world.tile},walls=new Uint8Array(width*height);for(let r=0;r<height;r++)for(let c=0;c<width;c++)if(!c||!r||c===width-1||r===height-1)walls[r*width+c]=1;return WaterMachinesBuilder.create({width,height,tile:${world.tile},walls}).encode();})()`,context);
}
async function screenshot(file){
  const clip=await evaluate('(()=>{const e=document.getElementById("toy-stage");if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()');
  const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,...(clip?{clip}:{})});fs.writeFileSync(path.join(output,file),Buffer.from(r.data,'base64'));
}
async function cleanup(){
  try{socket?.close();}catch{}server.close();
  if(chrome&&chrome.exitCode===null&&chrome.signalCode===null){const stopped=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill('SIGTERM');await Promise.race([stopped,sleep(2000)]);if(chrome.exitCode===null&&chrome.signalCode===null){chrome.kill('SIGKILL');await stopped;}}
  for(const p of pending.values())clearTimeout(p.timer);fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
process.once('SIGINT',()=>cleanup().finally(()=>process.exit(130)));process.once('SIGTERM',()=>cleanup().finally(()=>process.exit(143)));
function command(file,args){try{return execFileSync(file,args,{encoding:'utf8'}).trim();}catch{return null;}}
const report={schema:'water-machines-integrated-v2',startedUTC:new Date().toISOString(),viewport,seeds,frameMode,cases,
  pairedMode,testSourceSHA256:Object.fromEntries([...testSources].map(([file,data])=>[file,hash(data)])),
  environment:{node:process.version,cpu:os.cpus()[0].model,memoryGiB:os.totalmem()/1024**3,model:command('sysctl',['-n','hw.model']),
    os:command('sw_vers',['-productVersion']),power:command('pmset',['-g','batt']),thermal:command('pmset',['-g','therm'])},
  sourceSHA256:Object.fromEntries([...frozen].map(([file,data])=>[file,hash(data)])),runs:[],errors,logs,
  limitation:'Uncapped owned Chrome with an optional RAF gate measures workload throughput, not physical display presentation.'};
const completed=new Set();
if(resume){
  const previous=JSON.parse(fs.readFileSync(path.join(output,'report.json')));
  assert.deepEqual(previous.sourceSHA256,report.sourceSHA256,'Resume preserves the frozen runtime');
  assert.deepEqual(previous.cases,cases);assert.deepEqual(previous.seeds,seeds);assert.equal(previous.frameMode,frameMode);
  assert.deepEqual(previous.errors,[],'Resume only healthy completed recordings');
  report.resumedFrom={startedUTC:previous.startedUTC,failure:previous.failure || null,testSourceSHA256:previous.testSourceSHA256,
    runIds:previous.runs.filter(r=>r.completed).map(r=>r.id)};
  for(const entry of previous.runs.filter(r=>r.completed)){
    const run=JSON.parse(fs.readFileSync(path.join(output,entry.runFile)));
    report.runs.push({id:run.id,machine:run.machine,case:run.case,seed:run.seed,options:run.options,
      summary:run.summary,finalPressure:{invalidCells:run.finalPressure?.invalidCells}});
    completed.add(run.id);
  }
}
function save(){
  // The full per-run files preserve raw diagnostics. Referencing them keeps a
  // multi-seed catalog below V8's string limit without dropping measurements.
  const runs=report.runs.map(run=>({id:run.id,machine:run.machine,case:run.case,seed:run.seed,options:run.options,
    runFile:run.id+'.json',completed:!!run.summary}));
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({...report,runs},null,2)+'\n');
}
try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const browserArguments=['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox',
    '--disable-gpu-vsync','--disable-frame-rate-limit','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];report.browserArguments=browserArguments;
  chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),browserArguments,{stdio:'ignore'});report.ownedGPUStartUTC=new Date().toISOString();report.ownedBrowserPID=chrome.pid;
  let launchError;chrome.once('error',error=>{launchError=error;});const active=path.join(profile,'DevToolsActivePort');
  for(let n=0;!fs.existsSync(active)&&n<200;n++){if(launchError)throw launchError;assert.equal(chrome.exitCode,null);await sleep(100);}
  assert(fs.existsSync(active),'Dedicated browser starts');const debug=Number(fs.readFileSync(active,'utf8').split('\n')[0]);
  let pageTarget;
  for(let n=0;n<100&&!pageTarget;n++){
    assert.equal(chrome.exitCode,null,'Owned browser remains alive during target creation');
    const pages=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
    pageTarget=pages.find(p=>p.type==='page'&&p.webSocketDebuggerUrl);
    if(!pageTarget)await sleep(100);
  }
  assert(pageTarget,'Owned browser creates a page target');
  socket=new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    else if(m.method==='Runtime.consoleAPICalled'){const text=m.params.args.map(a=>a.value||a.description).join(' ');logs.push(text);if(m.params.type==='error'||/LiquidWGPU.*FAIL/.test(text))errors.push(text);}});
  await send('Runtime.enable');await send('Page.enable');report.browser=await send('Browser.getVersion');
  await send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile});
  if(frameMode!=='native')await send('Page.addScriptToEvaluateOnNewDocument',{source:`(${installCadence.toString()})(${frameMode==='paced120'?120:60});`});
  const base=`http://127.0.0.1:${server.address().port}`;
  let seedScript;
  for(const c of cases)for(const seed of seeds){
    const id=c.machine+'-'+c.name+'-seed-'+seed,duration=Number(c.seconds || seconds);
    if(completed.has(id))continue;
    if(seedScript)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:seedScript});
    seedScript=(await send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{let state=${seed>>>0};Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};})()`})).identifier;
    const declaredToken=c.world?declaredWorldToken(c.world):null;
    await send('Page.navigate',{url:base+'/archive/water-smoke-slime/water-smoke-slime.html'+(declaredToken?'?build='+encodeURIComponent(declaredToken):'')});
    let ready=false;for(let n=0;n<600;n++){ready=await evaluate('!!window.__toy && __toy.stats().waterState===\'on\'');if(ready)break;await sleep(100);}assert(ready,'Hardware water boots');
    await evaluate('__toy.pause(true)');
    await evaluate(`__toy.machine(${JSON.stringify(c.machine)},${JSON.stringify({...c.options,seed})})`);
    await evaluate('__toy.pause(true)');
    await sleep(50);
    assert(!errors.some(message=>message.includes('WebGPU validation')),
      'GPU validation failed during apparatus setup; this run has no valid physics evidence');
    if(c.world)assert.deepEqual(await evaluate('({w:__toy.world().w,h:__toy.world().h,tile:__toy.world().tile})'),c.world,'Real host boot derives the declared world from a shared empty builder');
    const initial=await evaluate(`(${installMeasurements.toString()})(${JSON.stringify(c.measurement || {})})`);
    const initialWords=await evaluate('(()=>{const L=__toy.liquid(),a=L.liquid.arrays,n=L.liquid.getCount(),b=new Float32Array(n*4);for(let i=0;i<n;i++){b[i*4]=a.x[i];b[i*4+1]=a.y[i];b[i*4+2]=a.vx[i];b[i*4+3]=a.vy[i];}return Array.from(new Uint32Array(b.buffer));})()');
    const initialBytes=Buffer.from(Uint32Array.from(initialWords).buffer);fs.writeFileSync(path.join(output,id+'-initial-pos.bin'),initialBytes);
    const run={id,machine:c.machine,case:c.name,seed,options:c.options,declaredWorld:c.world || null,worldShareToken:declaredToken,measurement:c.measurement || null,initial,initialPositionSHA256:hash(initialBytes),rows:[],frames:[],actions:[]};
    if(initial.settings.macTransfer){
      const initialized=await evaluate(`(${residentSnapshot.toString()})()`);run.initialResident={...initialized,buffers:{}};
      for(const [key,bytes]of Object.entries(await pullRecords('__machineResidentResult',initialized.recordLengths))){const file=id+'-initialized-'+key+'.bin';fs.writeFileSync(path.join(output,file),bytes);run.initialResident.buffers[key]={file,bytes:bytes.length,sha256:hash(bytes)};}
    }
    report.runs.push(run);save();
    if(nativePassage&&!pairedMode)await evaluate(`(${installNativePassage.toString()})(${JSON.stringify({tailStart:duration-10})}).then(observer=>{window.__nativePassage=observer;return true;})`);
    if(pairedMode){
      await evaluate(`window.__machineNativeObserver=(${installNativePairedObserver.toString()})();window.__machineNativePrevious=null;window.__machineNativeCurrent=null;`);
      const apparatusStartedAt=await evaluate('__toy.machineState().startedAt'),steps=[];let elapsed=0,failed=false;
      try{
        while(elapsed<duration){
          const metadata=await evaluate(`(async()=>{window.__machineNativePrevious=window.__machineNativeCurrent;
            window.__machineNativeCurrent=await __machineNativeObserver.step(1/240);
            return __machineNativeCurrent.metadata;})()`);
          elapsed=metadata.endClock-apparatusStartedAt;
          steps.push(metadata);
          failed=metadata.phaseLedger.unresolvedVoidVolume>0||metadata.phaseLedger.zeroMassRetainedCells>0||
            metadata.convergence.waterPressureError>.1||metadata.convergence.waterFloorVolume>0||
            metadata.convergence.gasFloorVolume>0||metadata.ledger.nonpositiveVolumes>0||metadata.ledger.connectivityErrors>0||
            metadata.macDiagnostics?.invalidMaterialUpdates>0||metadata.macDiagnostics?.overflowErrors>0;
          if(failed)break;
          if(steps.length>Math.ceil(duration*120)+2)throw Error('Paired manual native quantum did not advance');
        }
        run.paired={mode:'Read-only controlled native update with static actual-host geometry',steps,stoppedOnFailure:failed,captures:{}};
        for(const [name,variable]of [['previous','__machineNativePrevious'],['current','__machineNativeCurrent']]){
          const meta=await evaluate(`(()=>{if(!window.${variable})return null;window.__machinePairedSerialized=(${serializePairedCapture.toString()})(window.${variable});return {metadata:__machinePairedSerialized.metadata,recordLengths:__machinePairedSerialized.recordLengths};})()`);
          if(!meta)continue;const saved={...meta,buffers:{}};
          for(const [key,bytes]of Object.entries(await pullRecords('__machinePairedSerialized',meta.recordLengths))){
            const file=id+'-paired-'+name+'-'+key+'.bin';fs.writeFileSync(path.join(output,file),bytes);saved.buffers[key]={file,bytes:bytes.length,sha256:hash(bytes)};}
          run.paired.captures[name]=saved;
        }
        run.finalSimulationSeconds=elapsed;
        run.summary={recorded:true,pairedDiagnostic:true,simulatedSeconds:elapsed,stoppedOnFailure:failed,
          countConserved:steps.every(s=>s.count===initial.initialCount&&s.residentCount===initial.initialCount),
          acceptance:'Read-only paired numerical diagnostic. Physical machine acceptance is unproven.'};
        fs.writeFileSync(path.join(output,id+'.json'),JSON.stringify(run,null,2)+'\n');save();
        console.log(JSON.stringify({id,pairedNativeSteps:steps.length,simulatedSeconds:elapsed,stoppedOnFailure:failed}));
      }finally{await evaluate('__machineNativeObserver.close()');}
      continue;
    }
    const targets=[0,...(c.frames || [1,2,5]),duration].filter((x,i,a)=>Number.isFinite(x)&&x>=0&&x<=duration&&a.indexOf(x)===i).sort((a,b)=>a-b);
    let nextFrame=0,nextSample=0;const actions=[...(c.actions || [])].sort((a,b)=>a.at-b.at);let nextAction=0;
    if(process.env.FIRST_PRESSURE_STEP!=='0'&&c.machine==='siphon'){
      const first=await evaluate(`(${initialPressureSnapshot.toString()})()`);run.firstPressure={...first,buffers:{},crest:[]};
      for(let i=0;i<first.crestRows;i+=128)run.firstPressure.crest.push(...await evaluate(`__machineFirstPressure.crest.slice(${i},${i+128})`));
      for(const [key,bytes] of Object.entries(await pullRecords('__machineFirstPressure',first.recordLengths))){const file=id+'-first-'+key+'.bin';fs.writeFileSync(path.join(output,file),bytes);run.firstPressure.buffers[key]={file,bytes:bytes.length,sha256:hash(bytes)};}
      save();
    }
    await sleep(50);await screenshot(id+'-000.png');
    const initialRenderedTime=await evaluate('__toy.liquid().simulationClock-__toy.machineState().startedAt');
    run.frames.push({target:0,at:initialRenderedTime,file:id+'-000.png'});nextFrame++;
    await evaluate('__machineMeasurement.runWallStartedAt=performance.now()-__machineMeasurement.startedAt;__toy.pause(false)');const wallStart=Date.now();let elapsed=0,lastProgress=0;
    while(elapsed<duration){
      const row=await evaluate('__machineMeasurement.sample()');elapsed=row.simulationSeconds;
      assert(!errors.some(message=>message.includes('WebGPU validation')),
        'GPU validation failed during simulation; this run has no valid physics evidence');
      if(elapsed>=duration)await evaluate('__toy.pause(true)');
      if(elapsed>=nextSample){run.rows.push(row);nextSample+=sampleInterval;}
      if(Date.now()-lastProgress>=10000){
        fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify({id,simulationSeconds:elapsed,targetSeconds:duration,
          wallSeconds:(Date.now()-wallStart)/1000,count:row.count,invalid:row.invalid,
          levels:row.instruments?.levels,water:row.instruments?.water,crossings:row.independentCrossings},null,2));
        lastProgress=Date.now();
      }
      while(nextAction<actions.length&&elapsed>=actions[nextAction].at){
        const action=actions[nextAction++],beforeParticles=await evaluate('__toy.stats().water');let result;
        await evaluate('__toy.pause(true)');const actionWallStart=Date.now();
        const beforePressure=await evaluate(`(${pressureDiagnostics.toString()})()`),beforeResident=await evaluate(`(${residentSnapshot.toString()})()`);
        const actionRecord={action,at:elapsed,beforeParticles,beforePressure:{...beforePressure,buffers:{}},beforeResident:{...beforeResident,buffers:{}}};
        if(nativePassage)actionRecord.beforeNativePassage=await evaluate('__nativePassage.capture()');
        const actionFrame=id+'-action-'+nextAction+'-before.png';await screenshot(actionFrame);actionRecord.beforeScreenshot=actionFrame;run.frames.push({target:action.at,at:elapsed,file:actionFrame});
        if(beforePressure)for(const [key,bytes] of Object.entries(await pullRecords('__machineFinalPressure',beforePressure.recordLengths))){const file=id+'-action-'+nextAction+'-air-'+key+'.bin';fs.writeFileSync(path.join(output,file),bytes);actionRecord.beforePressure.buffers[key]={file,bytes:bytes.length,sha256:hash(bytes)};}
        for(const [key,bytes] of Object.entries(await pullRecords('__machineResidentResult',beforeResident.recordLengths))){const file=id+'-action-'+nextAction+'-'+key+'.bin';fs.writeFileSync(path.join(output,file),bytes);actionRecord.beforeResident.buffers[key]={file,bytes:bytes.length,sha256:hash(bytes)};}
        if(action.type==='primary')result=await evaluate('__toy.machinePrimary()');
        else if(action.type==='slime'){
          assert(['x','y','radius'].every(key=>Number.isFinite(action[key]))&&action.radius>0,'Finite slime drop geometry');
          result=await evaluate(`!!__toy.slime(${action.x},${action.y},${action.radius})`);
          assert(result,'The requested slime was created');
        }
        else if(action.type==='valve')result=await evaluate(`__toy.valve(${JSON.stringify(action.id)},${JSON.stringify(!!action.open)})`);
        else if(action.type==='pressure-floor'){
          assert(Number.isFinite(action.value),'Finite pressure floor');
          result=await evaluate(`__toy.airMinimumPressure(${action.value})`);
        }
        else if(action.type==='observe')result=true;
        else throw Error('Unknown physical test action '+action.type);
        const afterParticles=await evaluate('__toy.stats().water');Object.assign(actionRecord,{result,afterParticles,observationPauseWallSeconds:(Date.now()-actionWallStart)/1000});run.actions.push(actionRecord);save();
        if(elapsed<duration)await evaluate('__toy.pause(false)');
      }
      if(nextFrame<targets.length&&elapsed>=targets[nextFrame]){const file=id+'-'+String(nextFrame).padStart(3,'0')+'.png';await screenshot(file);run.frames.push({target:targets[nextFrame],at:elapsed,file});nextFrame++;}
      if((Date.now()-wallStart)/1000>maxWallSeconds)throw Error('Integrated case exceeds wall-time bound at '+elapsed+' simulation seconds');
      if(!row.simActive)throw Error('Hardware water solver stopped');
      await sleep(50);
    }
    await evaluate('__toy.pause(true)');run.wallSeconds=(Date.now()-wallStart)/1000;
    run.rows.push(await evaluate('__machineMeasurement.sample()'));
    save();const resident=await evaluate(`(${residentSnapshot.toString()})()`);
    run.resident={...resident,records:undefined,buffers:{}};
    for(const [key,bytes] of Object.entries(await pullRecords('__machineResidentResult',resident.recordLengths))){const file=id+'-final-'+key+'.bin';fs.writeFileSync(path.join(output,file),bytes);run.resident.buffers[key]={file,bytes:bytes.length,sha256:hash(bytes)};}
    if(c.renderComparison){
      run.renderComparison={frames:[],particleBuffersIdentical:true};
      for(const [name,value]of [['legacy',0],['volume',1]]){
        await evaluate(`(async()=>{const liquid=__toy.liquid();liquid.setRenderParam('VOLUME_SPLATS',${value});liquid.draw();await liquid.queue.onSubmittedWorkDone();})()`);await sleep(100);
        const file=id+'-surface-'+name+'.png';await screenshot(file);run.renderComparison.frames.push({name,file});
      }
      const held=await evaluate(`(${residentSnapshot.toString()})()`);
      for(const [key,bytes]of Object.entries(await pullRecords('__machineResidentResult',held.recordLengths))){
        assert.equal(hash(bytes),run.resident.buffers[key].sha256,'Surface comparison cannot change native '+key);
      }
    }
    const pressure=await evaluate(`(${pressureDiagnostics.toString()})()`);
    run.finalPressure={...pressure,buffers:{}};
    if(pressure)for(const [key,bytes] of Object.entries(await pullRecords('__machineFinalPressure',pressure.recordLengths))){const file=id+'-final-air-'+key+'.bin';fs.writeFileSync(path.join(output,file),bytes);run.finalPressure.buffers[key]={file,bytes:bytes.length,sha256:hash(bytes)};}
    const raw=await evaluateLarge('(()=>{const d=__machineMeasurement;d.finished=true;return {intervals:d.intervals.filter(r=>r.wall>=d.runWallStartedAt),maps:d.maps.filter(r=>r.at>=d.runWallStartedAt),pressureSnapshots:d.pressureSnapshots,particlePaths:d.particlePaths,crossingEvents:d.crossingEvents,outletEvents:d.outletEvents,tracking:d.summary(),cadence:window.__machineCadence || null};})()');Object.assign(run,raw);
    // The machine's start clock is authoritative even if its initial mirror
    // still refers to the previous scene while upload is pending.
    run.finalSimulationSeconds=await evaluate('__toy.liquid().simulationClock-__toy.machineState().startedAt');
    if(nativePassage&&!pairedMode){
      run.nativePassage=await evaluate('__nativePassage.capture()');
      await evaluate('__nativePassage.close()');
    }
    run.summary=summarize(run);
    if(run.nativePassage){
      assert.equal(run.nativePassage.initialBulk,run.initial.initialSourceCount,'Native passage tracks the initial bulk inventory');
      assert.equal(run.nativePassage.finalBulkInReceiver,run.summary.finalResidentBulkSourceIDsInReceiver.length,
        'Passive GPU receiver inventory agrees with the independently copied native positions');
    }
    fs.writeFileSync(path.join(output,id+'.json'),JSON.stringify(run,null,2)+'\n');save();
    console.log(JSON.stringify({id,summary:run.summary,finalPressure:pressure}));
    const frameHtml='<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fff;font:15px sans-serif}.strip{display:flex}.frame{width:288px}.frame img{width:288px;display:block}.frame p{margin:8px}</style><div class="strip">'+run.frames.map(f=>'<div class="frame"><img src="'+f.file+'"><p>'+f.at.toFixed(3)+' simulation seconds</p></div>').join('')+'</div>';
    const frameFile=id+'-strip.html';fs.writeFileSync(path.join(output,frameFile),frameHtml);
    await send('Emulation.setDeviceMetricsOverride',{width:run.frames.length*288,height:240,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:base+'/__machine_artifact/'+frameFile});await sleep(100);await screenshot(id+'-strip.png');run.frameStrip=id+'-strip.png';save();
    await send('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile});
  }
  report.finishedUTC=new Date().toISOString();report.recordingComplete=true;
  report.particleStateHealthy=pairedMode?null:errors.length===0&&report.runs.every(r=>r.summary.countConserved&&r.summary.allMirrorParticlesFinite&&r.summary.allResidentPositionsVelocitiesFinite);
  report.pressureDiagnosticsHealthy=pairedMode?null:!errors.some(message=>message.includes('WebGPU validation'))&&report.runs.every(r=>r.finalPressure?.invalidCells===0&&r.summary.maximumNonpositiveGasVolumes===0&&
    r.summary.maximumConnectivityErrors===0&&r.summary.maximumOverflowErrors===0&&r.summary.maximumUnassignedGasAmount===0&&
    r.summary.ledgerMaximumAbsoluteBalanceError===0&&r.summary.cavitationResolvedInEveryReading&&r.summary.phaseResolvedInEveryReading);
  report.fullMachineAcceptance='Pending design variants and complete machine-specific evidence.';save();
  console.log(JSON.stringify({recordingComplete:true,particleStateHealthy:report.particleStateHealthy,pressureDiagnosticsHealthy:report.pressureDiagnosticsHealthy,report:path.join(output,'report.json')}));
  if(process.env.REQUIRE_HEALTHY==='1')assert(report.particleStateHealthy&&report.pressureDiagnosticsHealthy,'Particle and pressure diagnostics');
}catch(error){report.recordingComplete=false;report.failure=error.message;save();throw error;}
finally{await cleanup();report.ownedGPUEndUTC=new Date().toISOString();report.ownedBrowserClosed=true;save();}
