// Compare exact sweep/projection behavior with the pre-optimization point solver.
// CPU-only. BENCH=1 times the dominant repeated open-tile path separately.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
const source=fs.readFileSync('js/sluice/344-soft-terrain.js','utf8');
// Frozen v28.171 reference. The interval and projection implementations are
// shared unchanged; only the point dispatch is under comparison.
const original=`function referenceTerrainPoint(b, i, h) {
  var x=b.px[i],y=b.py[i];
  if(!isFinite(x+y)||!b._guardPX)return false;
  var sx=b._guardPX[i],sy=b._guardPY[i];
  var r0=Math.floor(Math.min(sy,y)/TILE),r1=Math.floor(Math.max(sy,y)/TILE);
  var c0=Math.floor(Math.min(sx,x)/TILE),c1=Math.floor(Math.max(sx,x)/TILE);
  var first=null,time=Infinity;
  for(var row=r0;row<=r1;row++)for(var col=c0;col<=c1;col++){
    if(tileAt(row,col)===null)continue;
    var hit=softTerrainInterval(sx,sy,x,y,col*TILE,row*TILE);
    if(hit&&hit.lo<time&&(hit.nx||hit.ny)){first=hit;time=hit.lo;}
  }
  if(first){
    var nx=first.nx,ny=first.ny;
    var depth=-((x-sx)*nx+(y-sy)*ny)*(1-time)+SOFT_TERRAIN_SKIN;
    softTerrainProject(b,i,i,0,nx,ny,depth,h);
    softTerrainReport.points++;softTerrainReport.sweeps++;
  }else if(jelloWorldSolidAt(x,y)){
    var face=softTerrainFace(x,y,sx,sy,Math.floor(y/TILE),Math.floor(x/TILE));
    if(!face)return false;
    softTerrainProject(b,i,i,0,face[0],face[1],face[2]+SOFT_TERRAIN_SKIN,h);
    softTerrainReport.points++;
  }
  return true;
}`;
const prelude=`var TILE=32,softProjectEnabled=true,JELLO_TIMESCALE=1,JELLO_REST_VEL=1,JELLO_BOUNCE=.2;
var tileCalls=0;
function tileAt(r,c){tileCalls++;return c<0||c>=40||r>=25||(r>=4&&c!==8&&c!==9)||(r===2&&c===5)?'solid':null;}
function jelloWorldSolidAt(x,y){if(!isFinite(x)||!isFinite(y))return false;return tileAt(Math.floor(y/TILE),Math.floor(x/TILE))!==null;}
function softPresentationBody(){return false;}`;
const c=vm.createContext({console});
vm.runInContext(prelude+source+original,c);
function body(x,y,sx,sy){return {px:[x],py:[y],ox:[x-.8],oy:[y-.3],_guardPX:[sx],_guardPY:[sy]};}
function run(fn,b){c.softTerrainReport={points:0,edges:0,sweeps:0,corners:0};c.tileCalls=0;const value=fn(b,0,1/360);return {value,b,report:c.softTerrainReport,calls:c.tileCalls};}
let seed=718,count=0,oldCalls=0,newCalls=0;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function compare(x,y,sx,sy){
  const before=run(c.referenceTerrainPoint,body(x,y,sx,sy)),after=run(c.softTerrainPoint,body(x,y,sx,sy));
  assert.deepEqual({value:after.value,b:after.b,report:JSON.stringify(after.report)},
    {value:before.value,b:before.b,report:JSON.stringify(before.report)},'Exact terrain point outcome '+[x,y,sx,sy]);
  oldCalls+=before.calls;newCalls+=after.calls;count++;
}
for(let i=0;i<18000;i++){
  const x=rand()*1350-35,y=rand()*950-90;
  compare(x,y,x+(rand()-.5)*(i%3?2:150),y+(rand()-.5)*(i%3?2:150));
}
for(const boundary of [-32,0,32,128,256,800,1280])for(const offset of [-1e-8,0,1e-8]){
  compare(boundary+offset,120,boundary+offset,120);
  compare(177,boundary+offset,176,boundary+offset-.2);
}
compare(10,10,NaN,10);compare(NaN,10,0,0);compare(Infinity,10,0,0);
console.log(JSON.stringify({passed:true,exactCases:count,referenceTileReads:oldCalls,optimizedTileReads:newCalls}));
if(process.env.BENCH==='1'){
  vm.runInContext('var benchBody={px:[171],py:[116],ox:[170.8],oy:[115.8],_guardPX:[170.9],_guardPY:[115.9]};function bench(fn,n){for(var i=0;i<n;i++)fn(benchBody,0,1/360);}',c);
  const rows=[];function time(fn){const start=performance.now();c.bench(fn,500000);return performance.now()-start;}
  c.bench(c.referenceTerrainPoint,10000);c.bench(c.softTerrainPoint,10000);
  for(let i=0;i<6;i++){
    const values=i%2?[time(c.softTerrainPoint),time(c.referenceTerrainPoint)].reverse():[time(c.referenceTerrainPoint),time(c.softTerrainPoint)];
    rows.push({beforeMs:values[0],afterMs:values[1]});
  }
  const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  console.log(JSON.stringify({benchmark:'500000 same-tile air point sweeps',rows,
    beforeMedianMs:median(rows.map(row=>row.beforeMs)),afterMedianMs:median(rows.map(row=>row.afterMs))}));
}
