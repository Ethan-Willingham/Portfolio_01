// Audit saved native Heron recordings. Does not run or modify the simulation.
// node tools/check-heron-recordings.mjs /absolute/recording-directory
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const directory=path.resolve(process.argv[2]),read=file=>JSON.parse(fs.readFileSync(path.join(directory,file),'utf8'));
const catalog=read('report.json'),seeds=[17,42,913],names=['sealed','raised','vented','empty','vent-during-jet'];
assert(catalog.recordingComplete,'Complete recording catalog required');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const Builder=createRequire(import.meta.url)(path.join(directory,'source/water-machines-builder.js'));
const checks=[],diagnosticChecks=[],rows=[],runs=new Map();
const check=(name,pass,detail)=>checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
for(const name of names)for(const seed of seeds){
  const id=`heron-${name}-seed-${seed}`,run=read(id+'.json');runs.set(id,run);
  const j=run.nativeJet,g=run.nativeGasBudget,n=run.resident.count,w=run.initial.world,d=run.initial.definition;
  const buffers={};for(const [key,record]of Object.entries(run.resident.buffers)){
    const bytes=fs.readFileSync(path.join(directory,record.file));assert.equal(sha(bytes),record.sha256,'Native buffer hash '+id+' '+key);buffers[key]=bytes;
  }
  assert.equal(buffers.pos.length,n*16);assert.equal(buffers.flag.length,n*4);
  const walls=new Uint8Array(w.cols*w.rows);
  for(let r=0;r<w.rows;r++)for(let c=0;c<w.cols;c++)if(!r||!c||r===w.rows-1||c===w.cols-1)walls[r*w.cols+c]=1;
  const builder=Builder.create({width:w.cols,height:w.rows,tile:w.tile,walls});
  d.vessels.forEach(v=>builder.vessel(v.rect,v.sealed));d.pipes.forEach(p=>builder.strokePipe(p.points,p.bore));
  (d.solids||[]).forEach(r=>builder.vent(r,false));(d.vents||[]).forEach(r=>builder.vent(r,true));
  run.actions.filter(a=>a.action.type==='vent').forEach(a=>builder.vent(a.action.rect,true));
  let nonWater=0,nonfinite=0,insideWalls=0,outsideWorld=0;
  for(let i=0;i<n;i++){
    const at=i*16,x=buffers.pos.readFloatLE(at),y=buffers.pos.readFloatLE(at+4),vx=buffers.pos.readFloatLE(at+8),vy=buffers.pos.readFloatLE(at+12),flag=buffers.flag.readUInt32LE(i*4);
    if(((flag&3)|((flag>>4)&4))!==0)nonWater++;
    if(![x,y,vx,vy].every(Number.isFinite))nonfinite++;
    if(x<0||y<0||x>=w.w||y>=w.h)outsideWorld++;
    else if(walls[Math.floor(y/w.tile)*w.cols+Math.floor(x/w.tile)])insideWalls++;
  }
  const early=j.emissionBySimulationSecond.slice(10,20).reduce((a,b)=>a+b,0),last10=j.emissionBySimulationSecond.slice(Math.floor(run.finalSimulationSeconds)-10).reduce((a,b)=>a+b,0);
  const first=run.actions[0].beforeNativeJet,checkpoint=run.actions.find(a=>a.action.at===18).beforeNativeJet;
  check(id+' exact water count and finite resident state',n===run.initial.initialCount&&nonWater===0&&nonfinite===0,{initial:run.initial.initialCount,final:n,nonWater,nonfinite});
  check(id+' resident wall and world containment',insideWalls===0&&outsideWorld===0,{insideWalls,outsideWorld});
  check(id+' held valve emits no water',first.forwardWaterCrossings===0);
  check(id+' every native gas step is accounted for',g.closureError===0&&g.maximumStepBalanceError===0,
    {closureError:g.closureError,discardedGas:g.unassignedAmount});
  diagnosticChecks.push({name:id+' gas geometry health',pass:g.maximumConnectivityErrors===0&&g.maximumOverflowErrors===0&&g.maximumNonpositiveVolumes===0,
    connectivityErrors:g.maximumConnectivityErrors,overflowErrors:g.maximumOverflowErrors,nonpositiveVolumes:g.maximumNonpositiveVolumes});
  assert.equal(j.initialBulk,run.initial.initialSourceCount);
  assert.equal(j.parcels.filter(p=>p.flags&4).length,j.emittedSourceParticles);
  if(name==='sealed'||name==='raised'){
    check(id+' source water crosses the actual upward nozzle',j.emittedSourceParticles/j.initialBulk>=.7);
    check(id+' most emitted source water returns to basin',j.returnedToBasin/j.emittedSourceParticles>=.95);
    // This tests the end of the sustained flow, not zero motion or zero late spurts.
    check(id+' final unique emissions fall below five percent of early flow',early>0&&last10<=early*.05,{early10:early,last10});
  }
  if(name==='vented')check(id+' vented lid prevents source jet',j.emittedSourceParticles===0&&j.forwardWaterCrossings===0);
  if(name==='empty')check(id+' empty source prevents any nozzle emission',j.initialBulk===0&&j.forwardWaterCrossings===0);
  let ventStop=null;
  if(name==='vent-during-jet'){
    const at35=run.actions.find(a=>a.action.at===35).beforeNativeJet;
    ventStop={emittedBeforeVent:checkpoint.emittedSourceParticles,newSourceEmissionsAfter23:j.emissionBySimulationSecond.slice(23).reduce((a,b)=>a+b,0),allWaterCrossingsAfter35:j.forwardWaterCrossings-at35.forwardWaterCrossings};
    check(id+' actual lid opening stops an established jet',checkpoint.emittedSourceParticles>1000&&ventStop.newSourceEmissionsAfter23===0&&ventStop.allWaterCrossingsAfter35===0,ventStop);
  }
  rows.push({run:id,case:name,seed,simulationSeconds:run.finalSimulationSeconds,initialParticles:run.initial.initialCount,initialSourceBulk:j.initialBulk,emittedSource:j.emittedSourceParticles,
    emittedFraction:j.initialBulk?j.emittedSourceParticles/j.initialBulk:null,returnedToBasin:j.returnedToBasin,returnFraction:j.emittedSourceParticles?j.returnedToBasin/j.emittedSourceParticles:null,
    peakRiseWorldPixels:j.peakRise,peakRiseInches:{p50:j.peakRise.p50===null?null:j.peakRise.p50*30/w.w,p95:j.peakRise.p95===null?null:j.peakRise.p95*30/w.w},
    checkpoint18:{simulationSeconds:run.actions[1].at,emittedSource:checkpoint.emittedSourceParticles,peakRiseWorldPixels:checkpoint.peakRise},
    finalBulkInSource:j.finalBulkInSource,lateUniqueEmissions:last10,earlyUniqueEmissions:early,forwardWaterCrossings:j.forwardWaterCrossings,ventStop,
    gas:g,countConserved:n===run.initial.initialCount,residentFinite:nonfinite===0,insideWalls,outsideWorld,maximumObservedParticleMove:j.maximumBulkDisplacementBetweenObservations,
    residentBufferSHA256:Object.fromEntries(Object.entries(run.resident.buffers).map(([key,b])=>[key,b.sha256])),runSHA256:sha(fs.readFileSync(path.join(directory,id+'.json')))});
}
const headResponse=[];
for(const seed of seeds){
  const sealed=runs.get(`heron-sealed-seed-${seed}`),raised=runs.get(`heron-raised-seed-${seed}`);
  const a=sealed.actions[1].beforeNativeJet.peakRise.p95,b=raised.actions[1].beforeNativeJet.peakRise.p95;
  check('seed'+seed+' raising receiving jar reduces early jet height',a>0&&b>0&&b<a,{sealed:a,raised:b});
  headResponse.push({seed,receivingJarRiseWorldPixels:48,sealedEarlyP95Rise:a,raisedEarlyP95Rise:b,relativeHeightDecrease:1-b/a});
}
const result={toyVersion:'v5.41',date:'2026-10-09',behaviorChecksPassed:checks.every(c=>c.pass),gasGeometryChecksPassed:diagnosticChecks.every(c=>c.pass),fullPhysicalAcceptance:false,
  criteria:{minimumSourceEmissionFraction:.7,minimumBasinReturnFraction:.95,maximumLateToEarlyUniqueEmissionRatio:.05,ventStopGraceSimulationSeconds:5,comparisonSimulationSeconds:18,stockSimulationSeconds:60},
  scope:'Native source-water jet startup, lower-jar head response, physical vent and empty-source controls, water inventory, final wall containment and explicit modeled gas accounting on three seeds. The end of sustained flow is measured separately from late spurts. Absolute jet height, pressure, phase boundaries, energy closure and 60 FPS are not certified.',
  method:'Five cases on seeds 17, 42 and 913 in the fixed 1120 by 664 world. Observer-owned GPU buffers track initial bulk source IDs through an interior riser plane and the upward nozzle mouth after every native update. A second passive observer sums every native pressure-step gas ledger, including discarded gas. The recorder waits for owned GPU submissions before scheduling another animation callback; it changes no physics or simulation step. Final native particle buffers are independently checked against reconstructed physical walls. No particle additions occur.',
  roomPressure:{psi:14.695948775513449,native:3796635.468785624,widthInches:30,widthWorldPixels:1120,oldNative:100000,oldPsi:.38707821428571426,source:'https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8'},
  limits:['Jet height is far below the lossless prediction; absolute flow and pressure are not calibrated.','Some source water remains below the intake. Sloshing can produce small later spurts; stationary water is not certified.','The gas ledger closes only when explicitly discarded gas is included. Small pockets can lose their stored gas, and capture/vent totals include transient exterior pockets. This does not prove physical gas conservation.','Pressure convergence, water/air boundaries and energy closure remain unresolved.','GPU-gated recording cadence measures behavior and does not certify presentation frame rate.'],
  sourceSHA256:catalog.sourceSHA256,testSourceSHA256:catalog.testSourceSHA256,catalogSHA256:sha(fs.readFileSync(path.join(directory,'report.json'))),checks,diagnosticChecks,headResponse,rows};
fs.writeFileSync(path.join(directory,'acceptance.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:result.behaviorChecksPassed,checks:checks.length,failures:checks.filter(c=>!c.pass),headResponse},null,2));
assert(result.behaviorChecksPassed,'Behavior checks failed; see acceptance.json');
