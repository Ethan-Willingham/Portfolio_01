#!/usr/bin/env node
// Acceptance uses copied native buffers and a passive per-update GPU observer.
// node tools/check-water-siphon-result.mjs /absolute/integrated-output
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

assert(process.argv[2], 'Supply the integrated output directory');
const folder=path.resolve(process.argv[2]),report=JSON.parse(fs.readFileSync(path.join(folder,'report.json')));
assert(report.recordingComplete && report.ownedBrowserClosed, 'The owned run finished');
assert.deepEqual(report.errors, [], 'No browser or GPU errors');
const require=createRequire(import.meta.url),Builder=require(path.join(folder,'source/water-machines-builder.js'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const cases=['canonical','valve','half-head','empty','raised','broken-restored'];
const criteria={minimumSourceDeliveryFraction:.40,maximumClosedValveDeliveryFraction:.005,
  minimumRestartedDeliveryFraction:.10,equilibriumLevelTolerance:16,equilibriumSpeedTolerance:1,equilibriumWindowSeconds:10,
  sourceDeliveryDeadline:120,stockSimulationSeconds:120,interruptedValveSimulationSeconds:180,
  maximumEquilibriumInventoryChangeFraction:.005,
  speedWindowAfterOpen:[2,7],maximumHeadResponseRelativeError:.35};
const rows=[];
const read=file=>{
  const bytes=fs.readFileSync(path.join(folder,file));assert.equal(bytes.length%16,0);
  return Array.from({length:bytes.length/16},(_,i)=>Array.from({length:4},(_,lane)=>bytes.readFloatLE(i*16+lane*4)));
};
const mean=values=>values.reduce((s,x)=>s+x,0)/values.length;

for(const entry of report.runs){
  const run=entry.runFile ? JSON.parse(fs.readFileSync(path.join(folder,entry.runFile))) : entry;
  assert.equal(run.machine,'siphon');assert(cases.includes(run.case));
  assert(run.resident && run.nativePassage, 'Native buffers and every-update observer required');
  const {w,h,tile}=run.initial.world;assert.deepEqual({w,h,tile},{w:1120,h:664,tile:8});
  const d=run.initial.definition,ids=run.initial.sourceOrigin.bulkIds,n=run.nativePassage;
  const initial=read(run.id+'-initial-pos.bin'),final=read(run.resident.buffers.pos.file);
  assert.equal(final.length,initial.length);assert(run.summary.countConserved);
  assert(final.every(p=>p.every(Number.isFinite)), 'All native positions and velocities finite');
  assert.equal(n.initialBulk,ids.length);assert(n.excludesRimSpills);
  assert.equal(n.spilledOverRim,0,'No source water spills over the rim');
  assert(n.updates>0 && n.maximumUpdateSeconds<.06, 'Observer runs after native updates');
  const pipes=new Set(run.initial.sourceOrigin.pipeInteriorTiles),inside=(p,r)=>
    p[0]>=r.x+tile && p[0]<r.x+r.width-tile && p[1]>=r.y && p[1]<r.y+r.height-tile;
  const region=p=>pipes.has(Math.floor(p[0]/tile)+','+Math.floor(p[1]/tile)) ? 'pipe' :
    inside(p,d.measure.source) ? 'source' : inside(p,d.measure.receiver) ? 'receiver' : 'other';
  const inventory={source:0,receiver:0,pipe:0,other:0};for(const id of ids)inventory[region(final[id])]++;
  assert.equal(inventory.receiver,n.finalBulkInReceiver, 'GPU counter agrees with copied resident positions');
  assert(n.finalBulkInReceiverAfterPassage>=0 && n.finalBulkInReceiverAfterPassage<=inventory.receiver,
    'Credit only source water with recorded crest and outlet passage');
  const opening=run.actions[0];assert.equal(opening.action.type,'primary');assert.equal(opening.action.at,10);
  assert.equal(opening.beforeNativePassage.exitedAfterCrest,0,'Closed valve holds source water');
  const held=read(opening.beforeResident.buffers.pos.file);
  assert.equal(ids.filter(id=>region(held[id])==='receiver').length,0);
  const cols=Math.ceil(w/tile),gridRows=Math.ceil(h/tile),walls=new Uint8Array(cols*gridRows);
  for(let y=0;y<gridRows;y++)for(let x=0;x<cols;x++)
    if(!x || !y || x===cols-1 || y===gridRows-1)walls[y*cols+x]=1;
  const builder=Builder.create({width:cols,height:gridRows,tile,walls});builder.begin('Captured apparatus');
  for(const v of d.vessels)builder.vessel(v.rect,v.sealed);
  for(const p of d.pipes)builder.strokePipe(p.points,p.bore);builder.commit();
  let insideWallCount=0;
  for(const [x,y] of final){assert(x>=0 && x<w && y>=0 && y<h);
    if(walls[Math.floor(y/tile)*cols+Math.floor(x/tile)])insideWallCount++;}
  assert.equal(insideWallCount,0, 'No final particle centers inside walls');
  const delivered=n.finalBulkInReceiverAfterPassage,deliveryFraction=delivered/ids.length;
  const tube=d.pipes[0],crestA=tube.points[1],crestB=tube.points[2],
    negative=(Math.floor((Math.ceil(tube.bore/tile)-1)*.5)+.5)*tile;
  const upperLane={xMin:crestA.x+tile*2,xMax:crestB.x-tile*2,
    yMin:d.measure.crest-negative,yMax:d.measure.crest-negative+tile};
  const upperLaneCount=points=>points.filter(([x,y])=>x>=upperLane.xMin && x<upperLane.xMax &&
    y>=upperLane.yMin && y<upperLane.yMax).length;
  const last=run.rows.at(-1).instruments;
  const speedRows=run.rows.filter(r=>r.instruments.ready && r.simulationSeconds>=opening.at+2 && r.simulationSeconds<=opening.at+7);
  const speeds=speedRows.map(r=>r.instruments.speed),heads=speedRows.map(r=>r.instruments.prediction?.head);
  let valve=null,columnBreak=null,settling=null;
  let deliveryAt120=null;
  if(['canonical','valve'].includes(run.case)){
    const duration=run.case==='valve'?criteria.interruptedValveSimulationSeconds:criteria.stockSimulationSeconds;
    assert(run.finalSimulationSeconds>=duration && run.finalSimulationSeconds<duration+1);
    const checkpoint=run.case==='valve'?run.actions.find(a=>a.action.type==='observe' && a.action.at===criteria.sourceDeliveryDeadline):null;
    if(run.case==='valve')assert(checkpoint,'Native two-minute checkpoint preserves the transfer deadline');
    deliveryAt120=checkpoint ? checkpoint.beforeNativePassage.finalBulkInReceiverAfterPassage : delivered;
    assert(deliveryAt120/ids.length>=criteria.minimumSourceDeliveryFraction,'Sustained source transfer by two minutes');
    assert(deliveryFraction>=criteria.minimumSourceDeliveryFraction,'Sustained source transfer');
    assert(Math.abs(last.levels.receiver-last.levels.source)<=criteria.equilibriumLevelTolerance,
      'Submerged outlet settles near equal tank levels');
    assert(n.finalWindow && n.finalWindow.parcelSamples>100,'Fresh native velocities cover the settling window');
    assert.equal(n.finalWindow.startSimulationSeconds,duration-criteria.equilibriumWindowSeconds);
    assert(Number.isFinite(n.finalWindow.signedMeanSpeed) && Number.isFinite(n.finalWindow.maximumParcelSpeed));
    settling={speedTargetMet:Math.abs(n.finalWindow.signedMeanSpeed)<criteria.equilibriumSpeedTolerance,
      receiverBulkChange:null,receiverBulkChangeFraction:null};
    if(run.case==='valve'){
      assert.deepEqual(run.actions.map(a=>[a.action.at,a.action.type]),[[10,'primary'],[25,'primary'],[35,'primary'],[120,'observe']]);
      const close=run.actions[1].beforeNativePassage,reopen=run.actions[2].beforeNativePassage;
      const duringClosure=reopen.exitedAfterCrest-close.exitedAfterCrest;
      const afterReopen=n.exitedAfterCrest-reopen.exitedAfterCrest;
      assert(duringClosure/ids.length<criteria.maximumClosedValveDeliveryFraction,'Closed valve stops delivery after the short outlet tail drains');
      assert(afterReopen/ids.length>criteria.minimumRestartedDeliveryFraction,'Reopening resumes the held column');
      valve={duringClosure,afterReopen,closureSeconds:run.actions[2].at-run.actions[1].at};
      settling.receiverBulkChange=n.finalBulkInReceiver-checkpoint.beforeNativePassage.finalBulkInReceiver;
      settling.receiverBulkChangeFraction=settling.receiverBulkChange/ids.length;
      assert(Math.abs(settling.receiverBulkChangeFraction)<criteria.maximumEquilibriumInventoryChangeFraction,
        'Net source transfer subsides over the final minute, including backward oscillation');
    }else{
      assert.deepEqual(run.options,{});
      assert(settling.speedTargetMet,'Stock net flow subsides near equilibrium');
    }
  }else if(run.case==='half-head'){
    assert.equal(run.options.outletHeight,452);assert(speeds.length>=10 && mean(speeds)>0);
    assert(delivered>0,'Lower positive head still transports source water');
  }else{
    assert.equal(n.crossedCrest,0,'The control cannot carry source water over the bend');
    assert.equal(n.exitedAfterCrest,0);assert.equal(delivered,0);
    if(run.case==='broken-restored'){
      assert.equal(run.options.pressure.minimumPressure,-15000);
      assert.equal(run.actions[1].action.type,'pressure-floor');assert.equal(run.actions[1].action.value,-80000);
      assert(run.finalSimulationSeconds-run.actions[1].at>=59,'Restoring pressure capacity alone does not refill the column');
      const beforeRestore=read(run.actions[1].beforeResident.buffers.pos.file);
      columnBreak={upperLane,initialUpperLaneParticles:upperLaneCount(initial),
        beforeRestoreUpperLaneParticles:upperLaneCount(beforeRestore),finalUpperLaneParticles:upperLaneCount(final)};
      assert(columnBreak.initialUpperLaneParticles>0,'The pressure control starts primed');
      assert.equal(columnBreak.beforeRestoreUpperLaneParticles,0,'An empty air lane spans the crest before restoration');
      assert.equal(columnBreak.finalUpperLaneParticles,0,'Restoring capacity does not refill the crest');
    }
  }
  rows.push({run:run.id,case:run.case,seed:run.seed,simulationSeconds:run.finalSimulationSeconds,
    initialParticles:initial.length,initialSourceBulk:ids.length,delivered,deliveryFraction,deliveryAt120,inventory,
    uncreditedSourceInReceiver:inventory.receiver-delivered,
    initialHead:d.measure.outlet.y-d.measure.sourceLevel,
    windowMeanSpeed:speeds.length?mean(speeds):null,windowMeanHead:heads.length?mean(heads):null,
    finalLevels:last.levels,finalDisplayedSpeed:last.speed,finalNativeWindow:n.finalWindow || null,settling,valve,columnBreak,insideWallCount,rimSpills:0,
    countConserved:true,allResidentFinite:true,maximumObservedParticleMove:n.maximumBulkDisplacementBetweenObservations});
}
for(const name of cases)assert.deepEqual(rows.filter(r=>r.case===name).map(r=>r.seed).sort((a,b)=>a-b),[17,42,913]);
const headResponse=[17,42,913].map(seed=>{
  const full=rows.find(r=>r.case==='canonical' && r.seed===seed),half=rows.find(r=>r.case==='half-head' && r.seed===seed);
  assert(full.windowMeanSpeed>half.windowMeanSpeed,'Greater positive head produces greater speed');
  const observedRatio=full.windowMeanSpeed/half.windowMeanSpeed,idealRatio=Math.sqrt(full.windowMeanHead/half.windowMeanHead);
  const relativeError=Math.abs(observedRatio/idealRatio-1);
  assert(relativeError<=criteria.maximumHeadResponseRelativeError,'Head response follows square-root direction and approximate ratio');
  return {seed,observedRatio,idealRatio,relativeError,fullSpeedToIdeal:full.windowMeanSpeed/Math.sqrt(500*full.windowMeanHead),
    halfSpeedToIdeal:half.windowMeanSpeed/Math.sqrt(500*half.windowMeanHead)};
});
const result={pass:true,settlingSpeedTargetMet:rows.filter(r=>r.settling).every(r=>r.settling.speedTargetMet),criteria,scope:'Standalone siphon transfer, valve stop/restart, empty and raised controls, pressure-capacity break without automatic reprime, containment, inventory and approximate head response. Interrupted runs verify small net inventory change near equal levels; their final-window velocity target is reported separately and can fail through oscillation. Quiescence, absolute flow speed, pressure and cavitation are not certified.',
  sourceSHA256:report.sourceSHA256,reportSHA256:hash(fs.readFileSync(path.join(folder,'report.json'))),rows,headResponse};
fs.writeFileSync(path.join(folder,'siphon-acceptance.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:true,runs:rows.length,deliveryFractions:rows.filter(r=>r.case==='canonical').map(r=>r.deliveryFraction),headResponse}));
