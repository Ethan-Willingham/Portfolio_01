// Compare landing queries and ordered support beds with the previous release.
// BENCH=1 node tools/perf/snow-bed-query-equivalence.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const file='js/sluice/159-snow-physics.js';
const old=execFileSync('git',['show',`${process.env.BASE_REF||'4219c6f6'}:${file}`],{encoding:'utf8'});
const next=fs.readFileSync(file,'utf8');
function engine(source) {
  const env={window:{},particleWeatherState:()=>({}),LIQUID_CELL:2.5,LIQUID_SNOW_DENSITY:3.2,
    COLS:320,TILE:32,liquidCount:18000,liquidType:new Uint8Array(18000),
    liquidX:new Float64Array(18000),liquidY:new Float64Array(18000),
    liquidWorldSolidAt:(x,y)=>y>=128};
  for(let i=0;i<env.liquidCount;i++){
    env.liquidType[i]=i%31?5:0;env.liquidX[i]=2000+(i%600)*1.35;
    env.liquidY[i]=127.3-Math.floor(i/600)*1.35;
  }
  const api=new Function(...Object.keys(env),source+`
    return {build:snowBuildSupport,insert:snowInsertContact,query:snowTouchesBed};
  `)(...Object.values(env));
  return api;
}
const a=engine(old),b=engine(next),before=a.build(),after=b.build();
assert.deepEqual([...after],[...before],'full ordered support bed unchanged');
let queries=0,seed=951;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function compare(x,y,reach,ba=before,bb=after){assert.equal(b.query(x,y,bb,reach),a.query(x,y,ba,reach),`${x}/${y}/${reach}`);queries++;}
for(let n=0;n<100000;n++)compare(1900+random()*1050,-500+random()*750,random()*3);
for(const [x,y] of [[2000,127.3],[2400,-45],[2000,87.3],[2400,128]]) {
  a.insert(before,x,y);b.insert(after,x,y);
  for(const reach of [0,1,1.4,2.5,-1.4,Infinity,NaN])for(const sign of [-1,1])for(const eps of [-1e-12,0,1e-12])compare(x,y+sign*reach+eps,reach);
}
assert.deepEqual([...after],[...before],'newly admitted grains preserve order and update bounds');
const rawA=new Map(),rawB=new Map();
for(const [x,y] of [[2000,1],[2001,1],[2200,-80]]){a.insert(rawA,x,y);b.insert(rawB,x,y);}
for(let n=0;n<1000;n++)compare(1995+random()*210,-85+random()*90,2.5,rawA,rawB);
for(const value of [NaN,Infinity,-Infinity,0,-0])compare(value,value,1.4);
console.log(`PASS ${queries} exact landing queries, ordered reconstruction, insertion, untracked maps and nonfinite queries.`);
if(process.env.BENCH==='1') {
  const points=Array.from({length:1000},(_,n)=>[2000+n*.75,-480+(n%150)*4]);
  const time=(e,bed)=>{let hits=0;for(let n=0;n<10000;n++){const p=points[n%1000];hits+=e.query(p[0],p[1],bed,1.4)?1:0;}
    const times=[];for(let run=0;run<9;run++){const start=performance.now();for(let n=0;n<100000;n++){const p=points[n%1000];hits+=e.query(p[0],p[1],bed,1.4)?1:0;}times.push(performance.now()-start);}return {ms:times.sort((a,b)=>a-b)[4],hits};};
  const x=time(a,before),y=time(b,after);assert.equal(x.hits,y.hits);console.log(JSON.stringify({queries:100000,beforeMs:x.ms,afterMs:y.ms,improvementPercent:(1-y.ms/x.ms)*100}));
}
