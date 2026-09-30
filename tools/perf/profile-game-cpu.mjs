// Pure source transformer for optional inclusive aggregate CPU diagnostics.
// No per-point timing, stage skips, or changes to response math and call order.
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function profileGameCPU(source){
 const end=source.lastIndexOf('})();');assert(end>=0,'Closure end');
const functions={
 softContactStep:'probe.rigContact',softPairsStep:'probe.bodyPairs',softContactSkin:'probe.selfSkin',
 jelloContainBodies:'probe.containment',jelloContactSolve:'probe.referenceContact',
 softMaterialSolve:'probe.materialSolve',softMaterialDamp:'probe.materialDamp',jelloSolveXPBD:'probe.XPBD',
 softWorldStep:'probe.waterJet',softTerrainSolve:'probe.terrainSolve',softTerrainEdges:'probe.terrainEdges',
 jelloCollideRingEdges:'probe.worldRingEdges',jelloLimitOrientation:'probe.orientation',jelloStrainLimit:'probe.strain',
 jelloIntegrate:'probe.integration',jelloResilienceStepBegin:'probe.guardBegin',jelloResilienceStepEnd:'probe.guardEnd',
 jelloRejectTerrainInside:'probe.enclosureGuard',jelloRejectGrabAfterContact:'probe.grabGuard',
 updateSnow:'probe.updateSnow',updateSnowAir:'probe.updateSnowAir',snowAirProject:'probe.snowAirProject',
 snowScan:'probe.snowScan',snowBuildSupport:'probe.snowBuildSupport',liquidToolSync:'probe.liquidToolSync'
};
for(const name of Object.keys(functions))assert.equal((source.match(new RegExp('function '+name+'\\s*\\(','g'))||[]).length,1,'Unique function '+name);
assert(source.includes('function playPerfStart('),'Recorder lifecycle anchor');
const bucketLimit=Number(source.match(/playPerfBucketLimit\s*=\s*(\d+)/)?.[1]);
const literalBuckets=new Set([...source.matchAll(/perf(?:Mark|Record)\(['"]([^'"]+)['"]/g)].map(match=>match[1]));
const consoleBays=source.match(/var CONSOLE_BAYS\s*=\s*\[([\s\S]*?)\];/)?.[1]||'';
const consoleBucketCount=[...consoleBays.matchAll(/id:\s*['"][^'"]+['"]/g)].length;
const estimatedBaselineBuckets=literalBuckets.size-(literalBuckets.has('console.')?1:0)+consoleBucketCount;
assert(Number.isInteger(bucketLimit)&&estimatedBaselineBuckets+Object.keys(functions).length<=bucketLimit,'Recorder has capacity for aggregate probes');

const code=`
// Private diagnostics: wrappers preserve return values, exceptions, arguments and call order.
var cpuProbeNames=${JSON.stringify(functions)},cpuProbeCounters={};
function cpuProbeReset(){cpuProbeCounters={};Object.keys(cpuProbeNames).forEach(function(name){cpuProbeCounters[name]={label:cpuProbeNames[name],calls:0,inclusiveMs:0,maxCallMs:0};});}
cpuProbeReset();
function cpuProbeWrap(name,fn){var wrapped=function(){if(!playPerfActive)return fn.apply(this,arguments);var started=performance.now();try{return fn.apply(this,arguments);}finally{var ended=performance.now(),row=cpuProbeCounters[name];row.calls++;row.inclusiveMs+=ended-started;row.maxCallMs=Math.max(row.maxCallMs,ended-started);perfRecord(cpuProbeNames[name],(perfBucketsRaw[cpuProbeNames[name]]||0)+(ended-started));}};wrapped._cpuProbeOriginal=fn;return wrapped;}
function cpuProbeInstall(){
${Object.keys(functions).map(name=>name+'=cpuProbeWrap('+JSON.stringify(name)+','+name+'._cpuProbeOriginal||'+name+');').join('\n')}
}
playPerfStart=(function(start){return function(){if(playPerfActive)return start.apply(this,arguments);cpuProbeReset();cpuProbeInstall();var value=start.apply(this,arguments);if(playPerfTrace)playPerfTrace.metadata.functionCPU={schema:'sluice-aggregate-cpu-probe-v1',sourceSHA256:${JSON.stringify(createHash('sha256').update(source).digest('hex'))},functions:cpuProbeCounters,notes:['Inclusive nested timings overlap. Do not sum parent/child function buckets.','Wrappers add two performance.now calls, additive perfRecord and counters per aggregate function invocation. Per-point and per-edge contact functions are not wrapped.','Counts only cover active recording. No stage skips, world or physics writes.']};return value;};})(playPerfStart);
if(window.__sluicePerformance)window.__sluicePerformance.start=playPerfStart;
window.__sluiceCPUFunctionTrace=function(){return JSON.parse(JSON.stringify(cpuProbeCounters));};
`;

 const instrumented=source.slice(0,end)+code+source.slice(end);
 new vm.Script(instrumented);
 return {source:instrumented,manifest:{sourceSHA256:createHash('sha256').update(source).digest('hex'),
  instrumentedSHA256:createHash('sha256').update(instrumented).digest('hex'),functions,
  extraBucketCount:Object.keys(functions).length,recorderBucketLimit:bucketLimit,estimatedBaselineBuckets,
  estimatedTotalBuckets:estimatedBaselineBuckets+Object.keys(functions).length,
  limitations:'Inclusive nested timings overlap. Wrappers add clock reads, additive perfRecord and counters per aggregate invocation. Terrain edges and self-skin nest inside parent solvers. Snow support/scan/air projection nest inside updateSnow/updateSnowAir and update.rain. Interpret with existing total CPU/jello buckets, not by summing every probe.'}};
}
