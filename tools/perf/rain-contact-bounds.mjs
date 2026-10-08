// The contact broad phase rejects only keys outside the completed liquid scan.
// BENCH=1 node tools/perf/rain-contact-bounds.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const file='js/sluice/157-particle-rain.js', source=fs.readFileSync(file,'utf8');
const prior=execFileSync('git',['show',`${process.env.BASE_REF||'4219c6f6'}:${file}`],{encoding:'utf8'});
function section(text,first,last){return text.slice(text.indexOf(first),text.indexOf(last));}
function engine(text,optimized) {
  const env={COLS:320,TILE:32,SKY_ROWS:4,RAIN_ORIGIN:3,RAIN_PLOW_CAP:96,
    RAIN_STORAGE_CAP:40000,LIQUID_MAX_PARTICLES:65536,
    cam:{x:1800,y:-500},screenW:1800,screenH:1400,surfacePonds:[],
    rain:{cells:{},waterCells:{},damp:[],parked:[],time:0},
    liquidX:[],liquidY:[],liquidType:[],liquidOrigin:[],liquidCount:0,
    liquidToolSync:()=>{},rainLakeAt:()=>null,rainPlowHolds:()=>false,
    rainSoakAt:()=>false,liquidWorldSolidAt:()=>false};
  return new Function(...Object.keys(env),`
    ${section(text,'  function rainCell(', '  function rainUpdatePlow(')}
    ${section(text,'  function rainScan(', '  function rainRecycle(')}
    return {rain,cam,key:rainCell,query:${optimized?'rainContactCount':'key => rain.cells[key] || 0'},
      set(points){liquidCount=points.length; for(let i=0;i<points.length;i++){
        liquidX[i]=points[i][0];liquidY[i]=points[i][1];liquidType[i]=points[i][2];liquidOrigin[i]=0;
      }rainScan(0);}};
  `)(...Object.values(env));
}
const a=engine(prior,false),b=engine(source,true);
let seed=3974,queries=0;
const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function compare(key){assert.equal(b.query(key),a.query(key),`key ${key}`);queries++;}
for(let trial=0;trial<40;trial++) {
  const points=Array.from({length:trial?3000:0},()=>[1700+rand()*1900,-650+rand()*1700,rand()<.15?5:0]);
  // Multiple particles in a cell exercise both snow (>1) and rain (>=4).
  points.push(...Array.from({length:6},()=>[2000,128,0]));
  for(const f of [a,b]){f.cam.y=trial%2?-1200:-500;f.set(points);}
  assert.deepEqual(b.rain.cells,a.rain.cells,'ordered cell occupancy');
  assert.deepEqual(b.rain.waterCells,a.rain.waterCells,'water-only occupancy');
  for(const key of Object.keys(a.rain.cells)) {
    for(const delta of [-1,0,1])compare(Number(key)+delta);
  }
  for(let q=0;q<2500;q++)compare(a.key(1000+rand()*3500,-3000+rand()*7000));
  for(const key of [NaN,Infinity,-Infinity,0,-0])compare(key);
}
// Reset/replacement maps must invalidate the optional broad phase by identity.
for(const f of [a,b])f.rain.cells={[-900000]:7,[9000000]:4};
for(const key of [-900001,-900000,-899999,0,9000000])compare(key);
for(const f of [a,b])f.set([]);
for(let key=-100000;key<=100000;key+=113)compare(key);
console.log(`PASS ${queries} contact queries; exact occupancy, scan replacement, empty maps, boundaries and nonfinite keys.`);
if(process.env.BENCH==='1') {
  const points=Array.from({length:3000},(_,i)=>[2000+i%800,128+Math.floor(i/800)*2,0]);
  a.set(points);b.set(points);
  const keys=Array.from({length:1000},(_,i)=>a.key(2000+i,-900+(i%200)*6));
  function time(f){let hits=0;const times=[];for(let run=0;run<12;run++){
    const at=performance.now();for(let i=0;i<100000;i++)hits+=f.query(keys[i%1000]);
    if(run>2)times.push(performance.now()-at);
  }return {ms:times.sort((x,y)=>x-y)[4],hits};}
  const before=time(a),after=time(b);assert.equal(after.hits,before.hits);
  console.log({queries:100000,beforeMs:before.ms,afterMs:after.ms,improvementPercent:(1-after.ms/before.ms)*100});
}
