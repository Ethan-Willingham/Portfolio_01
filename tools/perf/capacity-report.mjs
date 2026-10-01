// Report workload throughput and service budgets without claiming display FPS.
// node tools/perf/capacity-report.mjs /absolute/run-directory [...directories]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const budgetMs=1000/120;
const quantile=(sorted,p)=>sorted[Math.min(sorted.length-1,Math.max(0,Math.ceil(p*sorted.length)-1))]??null;
function stats(values){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
 return {count:sorted.length,median:quantile(sorted,.5),p95:quantile(sorted,.95),p99:quantile(sorted,.99),max:sorted.at(-1)??null,
  mean:sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:null};
}
function summarize(directory){
 const filename=path.join(directory,'trace.json'),bytes=fs.readFileSync(filename),trace=JSON.parse(bytes);
 assert(trace.exportComplete&&trace.frameCount>0,'A complete active capture is required');
 const columns=Object.fromEntries(trace.columns.map((name,i)=>[name,i]));
 const frames=[];
 for(const chunk of trace.frameChunks){
  assert(chunk.length%trace.stride===0,'Complete frame rows');
  for(let i=0;i<chunk.length;i+=trace.stride)frames.push(chunk.slice(i,i+trace.stride));
 }
 assert.equal(frames.length,trace.frameCount,'No missing frames');
 const values=name=>frames.map(row=>row[columns[name]]);
 const cpu=values('cpuMs'),interval=values('intervalMs');
 const fullSeconds=trace.seconds.filter(second=>second.durationMs>=900);
 const awake=values('awakeResidents'),microsteps=values('microsteps'),groups={};
 for(const row of frames){
  const key=row[columns.awakeResidents]+' awake / '+row[columns.microsteps]+' microsteps';
  (groups[key]??=[]).push(row[columns.cpuMs]);
 }
 const gpuRows=trace.gpu.filter(row=>row.name==='liquid.frame');
 const gpuGroups={};
 for(const row of gpuRows){
  const water=row.passes.filter(pass=>pass.name==='liquid.g2p').length;
  const grains=row.passes.filter(pass=>pass.name==='snow.predict').length;
  const key=water+' water quanta / '+grains+' grain ticks';
  const group=gpuGroups[key]??={rows:0,partial:0,passSums:[],spans:[]};
  group.rows++;group.partial+=!!row.partial;
  if(!row.partial){group.passSums.push(row.ms);if(Number.isFinite(row.spanMs))group.spans.push(row.spanMs);}
 }
 const completion=trace.queueCompletion;
 const completedRows=(completion?.rows||[]).filter(row=>!row.kind);
 const status=completion?.status;
 const submittedQuanta={waterQuanta:0,snowGrainTicks:0,liquidEncoders:0,byFrame:{}};
 for(const row of completedRows)for(const encoder of row.quanta||[]){
  submittedQuanta.waterQuanta+=encoder.waterQuanta;
  submittedQuanta.snowGrainTicks+=encoder.snowGrainTicks;submittedQuanta.liquidEncoders++;
  const key=encoder.waterQuanta+' water quanta / '+encoder.snowGrainTicks+' grain ticks';
  submittedQuanta.byFrame[key]=(submittedQuanta.byFrame[key]||0)+1;
 }
 submittedQuanta.waterQuantaPerSecond=submittedQuanta.waterQuanta*1000/trace.durationMs;
 submittedQuanta.snowGrainTicksPerSecond=submittedQuanta.snowGrainTicks*1000/trace.durationMs;
 const cadence=trace.cadence;
 const delta=key=>cadence?.start&&cadence?.end?cadence.end[key]-cadence.start[key]:null;
 const measurement=trace.testHarness||{};
 const focus=measurement.frameFocus;
 const focusedThroughCapture=!!focus&&focus.start?.focused===true&&focus.end?.focused===true&&focus.start?.visibility==='visible'&&focus.end?.visibility==='visible'&&Array.isArray(focus.events)&&!focus.dropped&&focus.events.every(event=>event.focused===true&&event.visibility==='visible');
 const nativeGameFPSMeasured=measurement.headless===false&&measurement.frameMode==='native'&&focusedThroughCapture;
 const cadenceLabel=nativeGameFPSMeasured?'Native foreground game animation callbacks':measurement.frameMode==='timer120'?'Timer-paced workload callbacks':'Browser animation callbacks; native foreground coverage not established';
 const finalState=trace.capacity?.end;
 const weather=finalState?.weather,expectedSnowBookkeeping=!!trace.capacity?.initial?.fixture?.options?.snow;
 const supportCounts=weather?.supportCounts;
 const weatherBookkeeping={expectedSnowBookkeeping,observed:weather||null,
 status:!expectedSnowBookkeeping?'snow-not-requested':!weather?'unobserved-historical-capture':!weather.updateEnabled?'weather-bookkeeping-off':!supportCounts?.enabled?'support-counts-disabled':!supportCounts.traceMatched||!supportCounts.calls?'support-builds-missing':supportCounts.failedCalls?'support-build-errors':'ordinary-snow-bookkeeping-observed',
 fullCPUCapacityAssertionEligible:!expectedSnowBookkeeping||!!(weather?.updateEnabled&&supportCounts?.enabled&&supportCounts.traceMatched&&supportCounts.calls>0&&!supportCounts.failedCalls),
 label:measurement.water===false?'Isolated GPU/component diagnostic; weather bookkeeping disabled by WATER=0':'Controlled ordinary-solver workload, weather/support coverage required when snow is requested'};
 if(measurement.water===false){weatherBookkeeping.fullCPUCapacityAssertionEligible=false;weatherBookkeeping.status='weather-bookkeeping-off';}
 if(process.env.REQUIRE_WEATHER_BOOKKEEPING==='1'&&(expectedSnowBookkeeping||measurement.water===false))assert(weatherBookkeeping.fullCPUCapacityAssertionEligible,'Full CPU capacity assertion requires enabled ordinary weather and observed support builds');
 const bodyWork=trace.capacity?.bodyWork,actualGroups={},workColumns=bodyWork?Object.fromEntries(bodyWork.columns.map((name,i)=>[name,i])):null;
 const activeCounts=[],solvingCounts=[],onscreenCounts=[],bodyCalls=[],pointSteps=[],springSteps=[];
 const activeOnStepping=[],solvingOnStepping=[],onscreenOnStepping=[],jelloPerBodyCall=[];
 let workFrames=0,bodyWorkCoverageValid=false;
 if(bodyWork){
  const seen=new Set();
  for(let i=0;i<bodyWork.frames.length;i+=bodyWork.stride){
   const id=bodyWork.frames[i+workColumns.frameId];
   assert(Number.isInteger(id)&&id>=0&&id<frames.length&&!seen.has(id),'Unique matching body work frame');seen.add(id);workFrames++;
   const calls=bodyWork.frames[i+workColumns.internalBodyCalls];
   bodyCalls.push(calls);activeCounts.push(bodyWork.frames[i+workColumns.activeBodies]);
   solvingCounts.push(bodyWork.frames[i+workColumns.solvingBodies]);onscreenCounts.push(bodyWork.frames[i+workColumns.onscreenActiveBodies]);
   pointSteps.push(bodyWork.frames[i+workColumns.internalPointSteps]);springSteps.push(bodyWork.frames[i+workColumns.internalSpringSteps]);
   if(calls>0){
    activeOnStepping.push(activeCounts.at(-1));solvingOnStepping.push(solvingCounts.at(-1));onscreenOnStepping.push(onscreenCounts.at(-1));
    const bucket=columns['cpu.update.jello'];
    if(bucket!==undefined)jelloPerBodyCall.push(frames[id][bucket]/calls);
   }
   (actualGroups[calls+' internal body calls']??=[]).push(frames[id][columns.cpuMs]);
  }
  bodyWorkCoverageValid=workFrames===frames.length;
 }
 return {schema:'sluice-capacity-service-report-v3',directory,version:trace.version,
  traceSHA256:createHash('sha256').update(bytes).digest('hex'),measurement,weatherBookkeeping,
  presentation:{nativeGameFPSMeasured,focusedThroughCapture,hardwareScanoutVerified:false,reason:nativeGameFPSMeasured?'Native foreground game FPS measured. Hardware scanout was not measured and is not required for this game FPS comparison.':measurement.headless?'Owned headless browser uses virtual presentation. Callback rates are workload throughput.':'Native foreground focus coverage was not established.'},
  target:{hz:120,budgetMs,policy:'Strict pacing default. Report every observed deadline violation; no quality reduction.'},
  callbackThroughput:{kind:cadenceLabel,durationMs:trace.durationMs,frames:trace.frameCount,meanHz:trace.frameCount*1000/trace.durationMs,
   fullSecondHz:stats(fullSeconds.map(second=>second.fps)),intervalMs:stats(interval),intervalsOverOneAndHalfPeriods:interval.filter(ms=>ms>budgetMs*1.5).length,timerMissedSlots:delta('missedSlots'),
   limitation:measurement.frameMode==='timer120'?'Timer120 is a workload demand test with actual elapsed-time physics and discarded missed slots. Its callbacks are not native game FPS; timer jitter is distinct from CPU budget violations.':'Animation callback cadence is game FPS. CPU and sampled GPU costs remain separate; callback intervals do not identify every compositor or scanout event.'},
  cpu:{ms:stats(cpu),overBudgetFrames:cpu.filter(ms=>ms>budgetMs).length,overBudgetFraction:cpu.filter(ms=>ms>budgetMs).length/frames.length,
   byAwakeAndMicrosteps:Object.fromEntries(Object.entries(groups).map(([key,ms])=>[key,stats(ms)])),
   byActualInternalCalls:Object.fromEntries(Object.entries(actualGroups).map(([key,ms])=>[key,stats(ms)])),
   inclusiveJelloMsPerInternalBodyCall:stats(jelloPerBodyCall),
   buckets:Object.fromEntries(trace.columns.filter(name=>name?.startsWith('cpu.')).map(name=>[name,stats(values(name))])),
   limitation:'Inclusive buckets overlap. Awake counts are recorder observations; waking during a step can change actual body work.'},
  populations:{initial:trace.capacity?.initial,measuredInitial:trace.initialState,final:finalState,
   awake:stats(awake),microsteps:stats(microsteps),snow:stats(values('snowActive')),
   actualBodyWork:{coverageValid:bodyWorkCoverageValid,workFrames,bodyCalls:stats(bodyCalls),pointSteps:stats(pointSteps),springSteps:stats(springSteps),active:stats(activeCounts),solving:stats(solvingCounts),onscreenActive:stats(onscreenCounts),
    onSteppingFrames:{active:stats(activeOnStepping),solving:stats(solvingOnStepping),onscreenActive:stats(onscreenOnStepping)},
    limitation:'Zero-work frames are included above. On-stepping counts exclude zero-call frames. Inclusive jello cost per body call still includes shared contact work.'},
   seconds:fullSeconds.map(second=>({atMs:second.atMs,visible:second.state.visibleResidents,awake:second.state.awakeResidents,snow:second.state.snowActive,residents:second.state.residents}))},
  gpu:{sampledEncoders:gpuRows.length,partial:gpuRows.filter(row=>row.partial).length,
   groups:Object.fromEntries(Object.entries(gpuGroups).map(([key,group])=>[key,{rows:group.rows,partial:group.partial,passSumMs:stats(group.passSums),spanMs:stats(group.spans),observedSpansOverBudget:group.spans.filter(ms=>ms>budgetMs).length}])),
   limitation:'Sparse sampled liquid encoders only. Span includes pass gaps but excludes queue wait, rendering, WebGL smoke and composition. A few samples cannot establish a strict p99 capacity limit.'},
  completion:{observed:!!completion,status,submittedQuanta,
   coverageStatus:completedRows.length?'Submitted WebGPU work observed':status?.devices?.length?'No WebGPU submission in this capture':'No WebGPU completion probe',
   notificationDelayUpperBoundMs:stats(completedRows.map(row=>row.submitToCompletionCallbackMs)),
   webGPUProbeCoverageValid:!!status&&completedRows.length>0&&status.devices.length>0&&!status.droppedRows&&!status.lostCoverage&&!status.errors.length&&status.devices.every(device=>device.pending===0),
   wholeFrameCoverageValid:false,
   limitation:'Fence completion callbacks include renderer notification delay. Pending promises are not a measurement of actual GPU queue depth.'},
  capacityCertified:false,nativeGameFPSMeasured};
}
assert(process.argv.length>2,'Pass one or more capture directories');
const reports=process.argv.slice(2).map(directory=>summarize(path.resolve(directory)));
for(const report of reports)fs.writeFileSync(path.join(report.directory,'service-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(reports.map(report=>({directory:report.directory,meanCallbackHz:report.callbackThroughput.meanHz,
 cpuMs:report.cpu.ms,cpuLateFraction:report.cpu.overBudgetFraction,awake:report.populations.awake,
 snow:report.populations.snow,gpu:report.gpu.groups,webGPUProbeCoverageValid:report.completion.webGPUProbeCoverageValid,
 nativeGameFPSMeasured:report.nativeGameFPSMeasured})),null,2));
