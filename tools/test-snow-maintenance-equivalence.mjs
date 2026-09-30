// Compare the production CPU functions against v28.130 with exact field and material checks.
// REFERENCE_REF or BEFORE/AFTER override the sources; DUMP selects an external report path.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';import vm from 'node:vm';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const reference=process.env.REFERENCE_REF||'3d9c4d6';
const paths={before:process.env.BEFORE||'git:'+reference+':js/sluice/159-snow-physics.js',after:process.env.AFTER||root+'/js/sluice/159-snow-physics.js'};
const sources={before:process.env.BEFORE?fs.readFileSync(paths.before,'utf8'):execFileSync('git',['show',reference+':js/sluice/159-snow-physics.js'],{cwd:root,encoding:'utf8'}),after:fs.readFileSync(paths.after,'utf8')};
const fields=['liquidX','liquidY','liquidVX','liquidVY','liquidType','liquidOrigin','liquidG00','liquidG01','liquidG10','liquidG11','liquidSleeping','liquidRestFrames'];
function build(source,fixture){
 const context=vm.createContext({fixture,performance,Float32Array,Float64Array,Uint32Array,window:{}});
 const code=`(function(){
 var Math=Object.create(globalThis.Math),randomState=982451653,randomCalls=0,supportBuilds=0;
 Math.random=function(){randomCalls++;randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 var COLS=2000,TILE=32,SKY_ROWS=16,TOTAL_ROWS=128,LIQUID_CELL=2.5,LIQUID_SNOW_DENSITY=3.2;
 var SNOW_ACTIVE_CAP=18000,SNOW_MASS_CAP=20000,SNOW_FLAKE_CAP=1800,LIQUID_MAX_PARTICLES=26000,RAIN_STORAGE_CAP=40000,RAIN_ORIGIN=3,LIQUID_OPS_MAX=2000000;
 var liquidCount=fixture.count,liquidMutationSeq=0,liquidOps=[],liquidOpsOverflow=false;
 var liquidX=new Float32Array(26000),liquidY=new Float32Array(26000),liquidVX=new Float32Array(26000),liquidVY=new Float32Array(26000),liquidType=new Uint32Array(26000),liquidOrigin=new Uint32Array(26000),liquidG00=new Float32Array(26000),liquidG01=new Float32Array(26000),liquidG10=new Float32Array(26000),liquidG11=new Float32Array(26000),liquidSleeping=new Uint32Array(26000),liquidRestFrames=new Uint32Array(26000);
 var arrays={${fields.join(',')}};
 var cam={x:450,y:250},screenW=500,screenH=500,rain={waterCells:{},waterCount:0,parked:[]};
 var liquidWGPU=fixture.cpu?null:{simActive:true,readbackApplyGen:1};
 function particleWeatherState(){return {time:0};}function liquidToolSync(){}
 function liquidWorldSolidAt(x,y){return y>=500||(x>=680&&x<688&&y>=430);}
 function rainCell(x,y){return Math.floor(y/6)*(Math.ceil(COLS*TILE/6)+1)+Math.floor(x/6);}
 function removeLiquidParticle(i){var n=--liquidCount;for(var a of Object.values(arrays))a[i]=a[n];liquidMutationSeq++;liquidOps.push(2,i);}
 function addLiquidParticle(type,x,y,vx,vy,origin){if(liquidCount>=LIQUID_MAX_PARTICLES)return -1;var i=liquidCount++;liquidType[i]=type;liquidX[i]=x;liquidY[i]=y;liquidVX[i]=vx;liquidVY[i]=vy;liquidOrigin[i]=origin;liquidG00[i]=liquidG01[i]=liquidG10[i]=liquidG11[i]=0;liquidSleeping[i]=liquidRestFrames[i]=0;liquidMutationSeq++;liquidOps.push(1,i,x,y,vx,vy,type,origin);return i;}
 ${source.replace('  function snowBuildSupport() {','  function snowBuildSupport() { supportBuilds++;')}
 worldSnowEnabled=true;snow.temperature=-4;snow.grains=[{x:400,y:200}];snow.airCount=3;
 for(var i=0;i<liquidCount;i++){
  liquidType[i]=i%19===0?0:5;liquidOrigin[i]=3;
  liquidX[i]=480+(i%140)*1.4;liquidY[i]=499.2-Math.floor(i/140)*1.4;
  liquidVX[i]=(i%11)-5;liquidVY[i]=(i%7)-3;
  liquidG00[i]=.2;liquidG01[i]=.3;liquidG10[i]=.4;liquidG11[i]=.5;liquidSleeping[i]=i%2;liquidRestFrames[i]=31;
  if(fixture.store&&i%13===0)liquidX[i]+=6000;
  if(liquidType[i]===0)rain.waterCount++;
  if(fixture.wet)rain.waterCells[rainCell(liquidX[i],liquidY[i])]=10;
 }
 for(var i=0;i<fixture.parked;i++){var x=510+(i%120)*1.3,y=490-Math.floor(i/120)*1.4;snow.parked.push(x,y,i%5,i%7);if(fixture.wet)rain.waterCells[rainCell(x,y)]=10;}
 return {arrays,scan:function(dt){if(liquidWGPU)liquidWGPU.readbackApplyGen++;snowScan(1/60,dt);},snapshot:function(){return {count:liquidCount,seq:liquidMutationSeq,ops:liquidOps.slice(),randomState,randomCalls,rain:{waterCount:rain.waterCount,parked:rain.parked.slice()},snow:{cells:snow.cells,parked:snow.parked.slice(),active:snow.active,mass:snow.mass,melted:snow.melted,readbackGen:snow.readbackGen,bed:Array.from(snow.bed.entries()).map(([k,v])=>[k,v.slice()])}};},builds:function(){return supportBuilds;}};
 })()`;
 return new vm.Script(code).runInContext(context);
}
const fixtures=[
 {name:'fresh-snapshot14k',count:14000,parked:400,dt:0},
 {name:'store-remove-unpark14k',count:14000,parked:400,dt:.12,store:true},
 {name:'wet-melt-unpark14k',count:14000,parked:400,dt:.12,wet:true},
 {name:'combined-maintenance14k',count:14000,parked:400,dt:.24,wet:true,store:true},
 {name:'cpu-maintenance14k',count:14000,parked:400,dt:.12,store:true,cpu:true},
 {name:'empty-unpark',count:0,parked:400,dt:.12}
];
const results=[];let comparisons=0;
for(const fixture of fixtures){const before=build(sources.before,fixture),after=build(sources.after,fixture),times={before:[],after:[]};
 for(let frame=0;frame<6;frame++){
  for(const label of frame%2?['after','before']:['before','after']){const obj=label==='before'?before:after,t=performance.now();obj.scan(fixture.dt);times[label].push(performance.now()-t);}
  for(const field of fields){const a=before.arrays[field],b=after.arrays[field];assert.equal(Buffer.compare(Buffer.from(a.buffer),Buffer.from(b.buffer)),0,fixture.name+'/'+frame+'/'+field);comparisons++;}
  assert.equal(JSON.stringify(before.snapshot()),JSON.stringify(after.snapshot()),fixture.name+'/'+frame+'/final-fields-and-random');comparisons++;
 }
 const median=a=>a.slice(1).sort((x,y)=>x-y)[2],state=after.snapshot();
 if(fixture.store)assert(state.ops.includes(2),'removal observed');if(fixture.wet)assert(state.snow.melted>0,'melt observed');
 if(fixture.parked&&fixture.dt)assert(state.snow.parked.length!==fixture.parked*4,'unpark or melt observed');
 results.push({name:fixture.name,beforeMedianMs:median(times.before),afterMedianMs:median(times.after),beforeBuilds:before.builds(),afterBuilds:after.builds(),finalCount:state.count,mutations:state.seq,melted:state.snow.melted,randomCalls:state.randomCalls,bedBuckets:state.snow.bed.length});
}
// Reseed the identical 14k workload before timing, so later melt depletion
// cannot turn the reported maintenance comparison into a tiny-particle case.
for(const fixture of fixtures){
 const timing={before:[],after:[]};
 for(let round=0;round<12;round++){
  const pair={before:build(sources.before,fixture),after:build(sources.after,fixture)};
  for(const label of round%2?['after','before']:['before','after']){const t=performance.now();pair[label].scan(fixture.dt);timing[label].push(performance.now()-t);}
 }
 const result=results.find(r=>r.name===fixture.name),median=a=>a.slice().sort((x,y)=>x-y)[6];
 result.fixedSeedBeforeMedianMs=median(timing.before);result.fixedSeedAfterMedianMs=median(timing.after);
 result.fixedSeedTimingRounds=12;
}
const sourceSHA256=Object.fromEntries(Object.entries(sources).map(([key,source])=>[key,createHash('sha256').update(source).digest('hex')]));
const report={pass:true,comparisons,paths,sourceSHA256,cases:results,limitation:'CPU-only support/maintenance microbenchmark; not game FPS.'};fs.writeFileSync(process.env.DUMP||'/tmp/snow-deferred-bed-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
