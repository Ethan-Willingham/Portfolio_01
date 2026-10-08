// Exact full terrain-pass comparison for the broad phase and contact queries.
// CPU-only. BENCH=1 times ordinary clear, near-floor and colliding bodies.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
const source=fs.readFileSync('js/sluice/344-soft-terrain.js','utf8');
const fast='    if (softTerrainSweepClear(b) && !(typeof softIntentBody === \'function\' && softIntentBody(b) && softContactSkinCrossed(b))) return;';
assert(source.includes(fast),'Actual broad-phase guard exists');
const baseline=process.env.BASE_REF||'4219c6f6c5e2bf86316d5e14ac156720f0184598';
const original=execFileSync('git',['show',baseline+':js/sluice/344-soft-terrain.js'],{encoding:'utf8'});
// Retain only the clear helper for direct guard checks; all reference solve,
// projection, point, face and edge functions come from the frozen shipped source.
const reference=source+original;
const prelude=`var TILE=32,softProjectEnabled=true,JELLO_TIMESCALE=1,JELLO_REST_VEL=1,JELLO_BOUNCE=.2;
var tileCalls=0,skinCalls=0,terrainFloor=4,faceMask=-1;
function tileAt(r,c){tileCalls++;if(faceMask>=0){var bit=r===7&&c===6?0:r===7&&c===8?1:r===6&&c===7?2:r===8&&c===7?3:-1;if(bit>=0)return faceMask&(1<<bit)?null:'solid';}return c<0||c>=40||r>=25||(r>=terrainFloor&&c!==8&&c!==9)||(r===2&&c===5)?'solid':null;}
function jelloWorldSolidAt(x,y){if(!isFinite(x)||!isFinite(y))return false;return tileAt(Math.floor(y/TILE),Math.floor(x/TILE))!==null;}
function softPresentationBody(){return false;}
function softIntentBody(b){return true;}
function softContactSkinCrossed(b){skinCalls++;return !!b.crossed;}
var softContactReport={selfContacts:0};
function softContactSkin(b){if(b.crossed){b.crossed=false;softContactReport.selfContacts++;}}
function jelloLimitOrientation(b){return false;}
function jelloCollidePointWorld(b,i,h){b.fallback=(b.fallback||0)+1;}
function jelloRestoreResilienceSnapshot(b){b.restored=true;}`;
function compile(text){return new Function(prelude+text+`;return {
  step:softTerrainSolve,clear:softTerrainSweepClear,face:softTerrainFace,
  floor:function(row){terrainFloor=row;},
  mask:function(value){faceMask=value;},
  stats:function(){return {tiles:tileCalls,skins:skinCalls,terrain:softTerrainReport,self:softContactReport};},
  reset:function(){tileCalls=skinCalls=0;softTerrainReport={points:0,edges:0,sweeps:0,corners:0};softContactReport={selfContacts:0};}
};`)();}
const before=compile(reference),after=compile(source);
function body(x,y,r,dx=0,dy=0){
  const b={n:37,ringN:18,surfaceSlime:true,ring:new Int32Array(18),px:new Float64Array(37),py:new Float64Array(37),ox:new Float64Array(37),oy:new Float64Array(37),_guardPX:new Float64Array(37),_guardPY:new Float64Array(37)};
  for(let i=0;i<37;i++){let angle=(i%18)/18*Math.PI*2,rad=i===36?0:i<18?r:r*.5;b.px[i]=x+Math.cos(angle)*rad;b.py[i]=y+Math.sin(angle)*rad;b.ox[i]=b._guardPX[i]=b.px[i]-dx;b.oy[i]=b._guardPY[i]=b.py[i]-dy;if(i<18)b.ring[i]=i;}
  // Resident subsystems attach different lazy caches to otherwise identical meshes.
  const mix=Math.floor(Math.abs(x+y))%8;
  if(mix%2)b._orientClear={valid:false};
  if(mix%3)b._softPX=new Float64Array(b.n);
  if(mix%4)b._softClearX=new Float64Array(b.ringN);
  if(mix%2===0)b._intentTopology={};
  if(mix%3===0)b._terrainStepHit=false;
  return b;
}
let seed=173,count=0,oldTiles=0,newTiles=0;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function compare(input){
  const a=structuredClone(input),b=structuredClone(input);before.reset();after.reset();
  before.step(a,1/360);after.step(b,1/360);
  assert.deepEqual(b,a,'Full body after terrain solve');
  const old=before.stats(),now=after.stats();
  assert.deepEqual(now.terrain,old.terrain);assert.deepEqual(now.self,old.self);
  oldTiles+=old.tiles;newTiles+=now.tiles;count++;
}
for(let i=0;i<1200;i++){
  const b=body(rand()*1320-20,rand()*850-50,5+rand()*32,(rand()-.5)*30,(rand()-.5)*30);
  if(i%9===0)b._terrainStepHit=true;
  if(i%11===0)b.crossed=true;
  compare(b);
}
for(const y of [32,64,96,128,800])for(const eps of [-1e-8,0,1e-8])compare(body(500,y-25+eps,25,0,0));
for(const coord of [NaN,Infinity,-Infinity]){const b=body(500,100,20);b.px[0]=coord;assert.equal(after.clear(b),false,'Invalid positions never use the broad phase');}
// Reuse each body so the lowest-node hint survives motion and terrain edits.
const persistentBefore=body(500,90,25),persistentAfter=structuredClone(persistentBefore);
for(const scene of [{x:500,y:90,floor:4},{x:500,y:104,floor:4},{x:500,y:90,floor:3},
  {x:500,y:90,floor:4},{x:3,y:90,floor:4},{x:278,y:170,floor:4},{x:900,y:-10,floor:4}]){
  const next=body(scene.x,scene.y,25,.03,.01);
  for(const b of [persistentBefore,persistentAfter]){
    for(const name of ['px','py','ox','oy','_guardPX','_guardPY'])b[name].set(next[name]);
    delete b._terrainStepHit;delete b.fallback;delete b.restored;
  }
  before.floor(scene.floor);after.floor(scene.floor);before.reset();after.reset();
  before.step(persistentBefore,1/360);after.step(persistentAfter,1/360);
  assert.deepEqual(persistentAfter,persistentBefore,'Persistent hint follows live coordinates and terrain');
  assert.deepEqual(after.stats().terrain,before.stats().terrain);count++;
}
before.floor(4);after.floor(4);
let faceCases=0;
for(let mask=0;mask<16;mask++){
  before.mask(mask);after.mask(mask);
  for(let i=0;i<200;i++){
    const args=[224+rand()*32,224+rand()*32,208+rand()*64,208+rand()*64,7,7];
    if(i===0)args.splice(0,4,240,240,240,240);
    if(i===1)args[2]=NaN;
    assert.deepEqual(after.face(...args),before.face(...args),'Face choice, ties and full tuple');faceCases++;
  }
}
before.mask(-1);after.mask(-1);
console.log(JSON.stringify({passed:true,exactCases:count,exactFaceCases:faceCases,referenceTileReads:oldTiles,optimizedTileReads:newTiles}));
if(process.env.BENCH==='1'){
  const rows=[];
  for(const scene of [{name:'clear',x:500,y:90,r:25},{name:'floor-clear',x:500,y:102,r:25},{name:'floor-touching',x:500,y:104,r:25}]){
    const samples=[];
    function time(api){const list=Array.from({length:8},(_,i)=>body(scene.x+i,scene.y,scene.r,.03,.01));const start=performance.now();for(let i=0;i<2500;i++)for(const b of list)api.step(b,1/360);return performance.now()-start;}
    for(let i=0;i<5;i++){const values=i%2?[time(after),time(before)].reverse():[time(before),time(after)];samples.push({beforeMs:values[0],afterMs:values[1]});}
    const median=key=>samples.map(row=>row[key]).sort((a,b)=>a-b)[2];
    rows.push({scene:scene.name,beforeMedianMs:median('beforeMs'),afterMedianMs:median('afterMs'),samples});
  }
  console.log(JSON.stringify({benchmark:'20000 complete terrain solves per scene',rows}));
}
