// Untimed actual surface constructor geometry and fixture-hook semantics.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {capacityWorkloadHook as originalHook} from './fixtures/capacity-workload-v133.mjs';
import {capacityWorkloadHook as candidateHook} from './capacity-workload.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const files=['340-jello.js','342-soft-contact.js','344-soft-material.js','344-soft-terrain.js','346-soft-intent.js','347-slime-locomotion.js','347-surface-slimes.js'];
const sources=files.map(f=>fs.readFileSync(root+'/js/sluice/'+f,'utf8'));
function fn(source,name){const a=source.indexOf('  function '+name+'('),b=source.indexOf('\n  function ',a+1);assert(a>=0);return source.slice(a,b<0?source.length:b);}
function make(hook,flags={}){
 let seed=48271;const math=Object.create(Math);math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const c=vm.createContext({Math:math,URLSearchParams,Float64Array,Float32Array,Int32Array,Int8Array,Uint8Array,Uint32Array,Array,Set,Map,window:{location:{search:''}},location:{search:''},TILE:32,GRAVITY:600,softProjectEnabled:true,softPlayEnabled:true,softPlayMaterialTrial:true,SOFT_INTENT:true,SOFT_PAIRS:true,ENABLE_JELLO:true,skySlimeSerial:1,COLS:320,TOTAL_ROWS:40,world:Array.from({length:40},(_,r)=>Array.from({length:320},()=>r>=4?{type:'stone',hp:2}:null)),performance:{now:()=>1000}});
 vm.runInContext(fn(fs.readFileSync(root+'/js/sluice/070-collision-liquids.js','utf8'),'tileAt')+'\n'+fn(fs.readFileSync(root+'/js/sluice/348-sky-slimes.js','utf8'),'skySlimeClamp')+'\n'+sources.join('\n'),c);
 vm.runInContext(`var introPhase='done',gamePaused=false,bathMode=false,worldRainEnabled=false,worldSnowEnabled=false,PERF_DISABLE_WATER=false,PERF_DISABLE_WEATHER=false,weatherTune={enabled:true};
 var snow={active:0,grains:[],parked:[]},rain={climate:{kind:'rain'},drops:[],impacts:[],parked:[],damp:[],plow:{}},worldScale=1,screenW=1512,screenH=982,cam={x:0,y:0},DECK_CENTER_COL=160,SKY_ROWS=4,PLAYER_W=32,PLAYER_H=30,LIQUID_CELL=2.5,LIQUID_SNOW_DENSITY=3.2,SNOW_ACTIVE_CAP=36000,RAIN_ORIGIN=3;
 var player={x:0,y:0},particles=[[0,4900,100,2,3,0]],playPerfActive=false,playPerfTrace=null,jelloRecordedMicrosteps=0,jelloActive=[];
 var supportCalls=[];function snowBuildSupport(){supportCalls.push({receiver:this,args:Array.from(arguments)});if(arguments[0]==='throw')throw arguments[1];return arguments[0];}
 function playPerfStart(){if(!playPerfActive){playPerfActive=true;playPerfTrace={frameCount:0,metadata:{}};}return 'start-result';}
 function playPerfState(){return {snowActive:snow.active};}function updateJello(dt){return dt;}
 function snowAirReset(){}var weatherForce=-1,weatherMoodCalls=[];function weatherSetMood(idx,snap){weatherMoodCalls.push([idx,snap]);}
 ${fn(fs.readFileSync(root+'/js/sluice/156-particle-weather.js','utf8'),'particleWeatherState')}
 ${fn(fs.readFileSync(root+'/js/sluice/159-snow-physics.js','utf8'),'snowReset')}
 ${fn(fs.readFileSync(root+'/js/sluice/158-rain-lakes.js','utf8'),'rainFrontDuration')}
 ${fn(fs.readFileSync(root+'/js/sluice/157-particle-rain.js','utf8'),'rainReset')}
 function surfaceSlimeGrabEnd(){}function snowSpawn(){return 'spawn';}function updateCamera(){cam.x=player.x-320;cam.y=0;cam.snap=false;}
 function liquidWorldSolidAt(x,y){return y>=128;}function addLiquidParticle(type,x,y,vx,vy,origin){particles.push([type,x,y,vx,vy,origin]);return particles.length-1;}
 ${hook}`,c);Object.assign(c,flags);return c;
}
function normalize(x){if(ArrayBuffer.isView(x))return {type:x.constructor.name,bytes:Buffer.from(x.buffer,x.byteOffset,x.byteLength).toString('hex')};if(x&&typeof x==='object')return Array.isArray(x)?Array.from(x,normalize):Object.fromEntries(Object.keys(x).sort().map(k=>[k,normalize(x[k])]));return x;}
let checks=0;
for(const snow of [0,1,512])for(const slimes of [0,1,5])for(const layout of ['dispersed','clustered']){
 const a=make(originalHook),b=make(candidateHook),options={snow,slimes,layout};a.window.__capacityWorkload.setup(options);b.window.__capacityWorkload.setup(options);
 for(const key of ['jelloBodies','particles','player','cam','world']){assert.deepEqual(normalize(b[key]),normalize(a[key]),`Exact ${key}/${snow}/${slimes}/${layout}`);checks++;}
 assert.equal(b.worldRainEnabled,!!snow);assert.equal(b.rain.climate.kind,snow?'snow':'rain');assert.equal(b.worldSnowEnabled,!!snow);checks+=3;
 if(snow){assert.equal(b.rain.climate.phase,2);assert.equal(b.rain.climate.strength,.65);assert.equal(b.rain.climate.first,false);assert.equal(b.rain.climate.kind,'snow');assert.equal(b.snow.primed,true);assert.deepEqual(Array.from(b.weatherMoodCalls.at(-1)),[4,true]);assert.deepEqual(Array.from(b.particles[0]),[0,4900,100,2,3,0]);checks+=7;}
}
const c=make(candidateHook),token={token:true},receiver={id:1};
assert.equal(c.snowBuildSupport.call(receiver,token,3),token);assert.equal(c.window.__capacityWorkload.state().weather.supportCounts.calls,0);checks+=2;
c.window.__capacityWorkload.setup({snow:1,slimes:0,layout:'dispersed'});assert.equal(c.playPerfStart(),'start-result');
assert.equal(c.snowBuildSupport.call(receiver,token,3),token);assert.equal(c.snowBuildSupport.call(receiver,token,4),token);c.playPerfTrace.frameCount=1;c.snowBuildSupport(token);
let state=c.window.__capacityWorkload.state();assert.equal(state.weather.supportCounts.calls,3);assert.equal(state.weather.supportCounts.framesWithCalls,2);assert.equal(c.supportCalls[1].receiver,receiver);assert.deepEqual(Array.from(c.supportCalls[1].args),[token,3]);checks+=6;
const error={id:'throw-token'};assert.throws(()=>c.snowBuildSupport('throw',error),value=>value===error);assert.equal(c.window.__capacityWorkload.state().weather.supportCounts.failedCalls,1);checks+=2;
c.playPerfActive=false;c.playPerfStart();state=c.window.__capacityWorkload.state();assert.equal(state.weather.supportCounts.calls,0);assert.equal(state.weather.supportCounts.framesWithCalls,0);checks+=2;
const rainSource=fs.readFileSync(root+'/js/sluice/157-particle-rain.js','utf8'),rainStart=rainSource.indexOf('  function updateParticleRain(dt) {'),rainEnd=rainSource.indexOf('    var gpu = liquidWGPU',rainStart);assert(rainStart>=0&&rainEnd>rainStart);
vm.runInContext(`var weather={pcp:.5},ordinarySnowCalls=[];rain.time=0;rain.scan=1;rain.scanDt=0;function liquidToolSync(){}function rainAdvanceWeather(){}function rainUpdatePlow(){}function rainScan(){}function weatherPrecipType(){return rain.climate.kind;}function updateSnow(dt,intensity){ordinarySnowCalls.push([dt,intensity]);}${rainSource.slice(rainStart,rainEnd)} }`,c);
for(const flags of [{},{PERF_DISABLE_WATER:true},{PERF_DISABLE_WEATHER:true},{bathMode:true},{worldRainEnabled:false},{weatherTune:{enabled:false}},{worldSnowEnabled:false}]){
 Object.assign(c,{worldRainEnabled:true,worldSnowEnabled:true,PERF_DISABLE_WATER:false,PERF_DISABLE_WEATHER:false,bathMode:false,weatherTune:{enabled:true}},flags);
 const s=c.window.__capacityWorkload.state().weather;assert.equal(s.updateEnabled,!!(c.worldRainEnabled&&!c.bathMode&&!c.PERF_DISABLE_WATER&&!c.PERF_DISABLE_WEATHER&&c.weatherTune.enabled));const previousCalls=c.ordinarySnowCalls.length;c.updateParticleRain(1/120);assert.equal(c.ordinarySnowCalls.length-previousCalls,s.updateEnabled&&c.worldSnowEnabled?1:0,'Actual early-return and snow dispatch prefix');checks+=2;
}
// Natural body-work hook never changes flags or counts support without controlled setup.
const natural=make(candidateHook,{worldRainEnabled:true,worldSnowEnabled:true});natural.playPerfStart();natural.snowBuildSupport(token);assert.equal(natural.worldRainEnabled,true);assert.equal(natural.worldSnowEnabled,true);assert.equal(natural.window.__capacityWorkload.state().weather.supportCounts.calls,0);checks+=3;
console.log(JSON.stringify({passed:true,checks,untimed:true,actualSurfaceConstructor:true,geometryParticleBytesExact:true,noBrowser:true,noGPU:true}));
