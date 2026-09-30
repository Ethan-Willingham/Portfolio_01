// CPU-only differential regression. No browser, GPU, or game loop is launched.
// BEFORE=3d9c4d6 selects a Git reference; an existing file path is also accepted.
// AFTER=/absolute/path selects another source; default is the current fragment.
// DUMP=/tmp/output-directory writes report.json. BENCH=0 skips timings.
// DRY_RUN=1 reads provenance without executing fixtures or timings.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = source => createHash('sha256').update(source).digest('hex');
function readBefore(relative) {
  const requested = process.env.BEFORE || '3d9c4d6';
  const file = path.resolve(ROOT, requested);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const source = fs.readFileSync(file, 'utf8');
    return { source, provenance: { path: file, sha256: sha(source) } };
  }
  const object = requested.includes(':') ? requested : requested + ':' + relative;
  const source = execFileSync('git', ['show', object], { cwd: ROOT, encoding: 'utf8' });
  return { source, provenance: { gitObject: object, sha256: sha(source) } };
}
function readAfter(relative) {
  const file = path.resolve(ROOT, process.env.AFTER || relative);
  const source = fs.readFileSync(file, 'utf8');
  return { source, provenance: { path: file, sha256: sha(source) } };
}
function saveReport(report, defaultDump) {
  const dump = path.resolve(process.env.DUMP || defaultDump);
  fs.mkdirSync(dump, { recursive: true });
  const file = path.join(dump, 'report.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
  return file;
}
const relative='js/sluice/345-soft-pairs.js';
const before=readBefore(relative),after=readAfter(relative);
const source=before.source,candidate=after.source;
const helperPath=path.join(ROOT,'js/sluice/340-jello.js');
const jello=fs.readFileSync(helperPath,'utf8');
const sources={before:before.provenance,after:after.provenance,
  helpers:{path:helperPath,sha256:sha(jello)},tool:{path:fileURLToPath(import.meta.url),sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url),'utf8'))}};
function fn(s,n){const a=s.indexOf('  function '+n+'(');assert(a>=0,n);const b=s.indexOf('\n  function ',a+1);return s.slice(a,b<0?s.length:b).trimEnd();}
for(const text of [source,candidate]) {
  assert(text.includes('function softPairsEdges('));
  new vm.Script(text);
}
if(process.env.DRY_RUN==='1') {
  console.log(JSON.stringify({schema:'sluice-soft-pairs-equivalence-v1',dryRun:true,sources,
    fixturePlan:{worlds:5,fixtures:170,steps:5,byteArrays:['px','py','ox','oy'],bench:process.env.BENCH!=='0'},
    fixturesExecuted:false,timingsExecuted:false,browserLaunched:false},null,2));
  process.exit(0);
}
function make(points,id=0){return {n:points.length,ringN:points.length,ring:Int32Array.from(points.map((_,i)=>i)),ringSign:1,cr:4,surfaceSlime:{id},_cHits:0,_solve:true,sleeping:false,sleepFrames:0,
 px:Float64Array.from(points.map(p=>p[0])),py:Float64Array.from(points.map(p=>p[1])),ox:Float64Array.from(points.map((p,i)=>p[0]-Math.sin(i*1.7+id)*.07)),oy:Float64Array.from(points.map((p,i)=>p[1]-Math.cos(i*1.3+id)*.07))};}
function cloneTyped(value) {
  return new value.constructor(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
}
function clone(b) {
  const c = { ...b, surfaceSlime: { ...b.surfaceSlime } };
  for (const key of ['ring','px','py','ox','oy','_softPX','_softPY']) if (b[key]) c[key] = cloneTyped(b[key]);
  return c;
}
function bytes(value) { return Buffer.from(value.buffer, value.byteOffset, value.byteLength); }
function geometry(b){return ['px','py','ox','oy'].map(k=>bytes(b[k]).toString('hex'));}
function context(src,world,observe=true){const patches=[],audio=[];const w={Math,Float64Array,Int32Array,SOFT_PAIRS:true,SOFT_CONTACT_POINT_MASS:.09,JELLO_TIMESCALE:1,jelloFrameNo:1,
 skySlimeClamp:(x,a,b)=>Math.max(a,Math.min(b,x)),jelloWorldSolidAt:world,jelloLimitOrientation:()=>{},softContactSkin:()=>{},softTerrainPoint:()=>false,jelloCollidePointWorld:()=>{},softTerrainEdges:()=>{}};
 if(observe){w.softPresentationBody=()=>true;w.softPresentationContact=(b,...args)=>audio.push([b.surfaceSlime.id,...args,...geometry(b)]);}
 vm.createContext(w);vm.runInContext(fn(jello,'jelloRingBBox')+'\n'+fn(jello,'jelloPointInRing')+'\n'+src,w);
 if(observe){const patch=w.softPairsPatch;w.softPairsPatch=(A,p,q,u,B,a,c,t,nx,ny,depth,h)=>{patches.push([A.surfaceSlime.id,p,q,u,B.surfaceSlime.id,a,c,t,nx,ny,depth,h]);return patch(A,p,q,u,B,a,c,t,nx,ny,depth,h);};}
 return {w,patches,audio};}
function same(a,b,label) {
  for (let i=0;i<a.length;i++) {
    for (const key of ['px','py','ox','oy']) {
      assert.equal(a[i][key].constructor.name, b[i][key].constructor.name, label+' array type '+key);
      assert.deepEqual(bytes(a[i][key]), bytes(b[i][key]), label+' bytes '+i+'/'+key);
    }
    for (const key of ['_cbL','_cbR','_cbT','_cbB','_cHits','_solve','sleeping','sleepFrames','_pairTouched'])
      assert.equal(a[i][key],b[i][key],label+' '+key+' '+i);
  }
}
let state=48271;function rnd(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;}
const radial=(n,cx,cy,r,odd=1)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2,d=r*(i%2?odd:1);return [cx+Math.cos(a)*d,cy+Math.sin(a)*d];});
const fixtures=[
 ['bars',[make([[-12,-1],[12,-1],[12,1],[-12,1]],1),make([[-1,-12],[1,-12],[1,12],[-1,12]],2)]],
 ['crossed-stars',[make(radial(18,100,100,27,.25),1),make(radial(19,104,102,27,.4),2)]],
 ['duplicates',[make([[0,0],[20,20],[20,20],[0,20],[20,0]],1),make([[5,-5],[15,25],[15,25],[5,25],[15,-5]],2)]],
 ['touching',[make([[0,0],[20,0],[20,20],[0,20]],1),make([[20,0],[40,0],[40,20],[20,20]],2)]],
 ['collinear',[make([[0,0],[10,0],[20,0],[30,0]],1),make([[5,0],[15,0],[25,0]],2)]],
 ['near-parallel',[make([[0,0],[100,1e-12],[100,10],[0,10]],1),make([[50,-1e-12],[150,0],[150,5],[50,5]],2)]],
 ['separated',[make(radial(18,100,100,22),1),make(radial(18,170,100,22),2)]],
 ['many',[make(radial(37,100,100,25,.1),1),make(radial(61,101,102,25,.2),2)]]
];
// These fixtures ensure byte comparisons and byte-preserving clones retain
// signed zero and the full NaN payload, beyond ordinary numeric equality.
{
  const a=make([[0,0],[-0,0],[-0,-0],[0,-0]],1), b=make([[60,60],[80,60],[80,80],[60,80]],2);
  a.ox.set(a.px); a.oy.set(a.py);
  fixtures.push(['signed-zero',[a,b]]);
}
{
  const a=make([[0,0],[10,0],[20,0],[30,0]],1), b=make([[5,0],[15,0],[25,0],[35,0]],2);
  const view=new DataView(a.px.buffer,a.px.byteOffset,a.px.byteLength);
  view.setBigUint64(8,0x7ff8123456789abcn,true);
  new DataView(a.ox.buffer,a.ox.byteOffset,a.ox.byteLength).setBigUint64(8,0x7ff8123456789abcn,true);
  fixtures.push(['nan-payload',[a,b]]);
}
for(let trial=0;trial<160;trial++){const count=2+Math.floor(rnd()*4),bodies=[];for(let i=0;i<count;i++){const n=5+Math.floor(rnd()*27),p=radial(n,100+rnd()*45,90+rnd()*20,15+rnd()*15,.1+rnd()*.9);if(trial%3===0)for(let j=p.length-1;j>0;j--){const k=Math.floor(rnd()*(j+1));[p[j],p[k]]=[p[k],p[j]];}const b=make(p,i+1);if(trial%2){b._softPX=new Float64Array(b.px);b._softPY=new Float64Array(b.py);for(let j=0;j<b.n;j++){b._softPX[j]+=(rnd()-.5)*5;b._softPY[j]+=(rnd()-.5)*5;}}bodies.push(b);}fixtures.push(['random-'+trial,bodies]);}
let comparisons=0,patchCalls=0,successful=0,audioCalls=0,earlyReturns=0;
for(const [worldName,world] of [['air',()=>false],['floor',(x,y)=>y>=110],['wall',(x,y)=>x>=115],['corner',(x,y)=>x>=115||y>=110],['all-solid',()=>true]]){
 const old=context(source,world),cur=context(candidate,world);
 for(const [name,seeds] of fixtures){const a=seeds.map(clone),b=seeds.map(clone);for(let step=0;step<5;step++){
   const label=worldName+'/'+name+'/'+step;old.w.jelloFrameNo=cur.w.jelloFrameNo=step;
   const contactsBefore=old.w.softPairsReport.contacts;
   if(step<3){for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){old.w.softPairsEdges(a[i],a[j],1/720);cur.w.softPairsEdges(b[i],b[j],1/720);}}
   else{assert.equal(old.w.softPairsStep(a,a.length,1/720),cur.w.softPairsStep(b,b.length,1/720),label+' count');}
   same(a,b,label);assert.deepEqual({...old.w.softPairsReport},{...cur.w.softPairsReport},label+' report');assert.deepEqual(old.patches,cur.patches,label+' patch sequence');assert.deepEqual(old.audio,cur.audio,label+' audio sequence');comparisons++;
   patchCalls+=old.patches.length;audioCalls+=old.audio.length;
   earlyReturns+=old.patches.length-(old.w.softPairsReport.contacts-contactsBefore);
   // Exercise arbitrary outside movers between invocations and reverse scans.
   if(step===1){a[0].px[0]+=.19;a[0].py[0]-=.23;b[0].px[0]+=.19;b[0].py[0]-=.23;}
   old.patches.length=cur.patches.length=old.audio.length=cur.audio.length=0;
 }
 }
 successful+=old.w.softPairsReport.contacts;
}
// Explicit early-return coverage, including a crossing whose four coordinates
// are all terrain-fixed. No candidate or audio event can be removed/reordered.
for(const world of [()=>false,()=>true]){const a=fixtures[0][1].map(clone),b=a.map(clone),old=context(source,world),cur=context(candidate,world);old.w.softPairsEdges(...a,1/720);cur.w.softPairsEdges(...b,1/720);same(a,b,'early coverage');assert.deepEqual(old.patches,cur.patches);assert.deepEqual(old.audio,cur.audio);assert(old.patches.length>0);patchCalls+=old.patches.length;audioCalls+=old.audio.length;if(!old.w.softPairsReport.contacts){earlyReturns+=old.patches.length;}else successful+=old.w.softPairsReport.contacts;}
assert(successful>100);assert(patchCalls>0);assert(audioCalls>0);assert(earlyReturns>0);
const median=x=>x.slice().sort((a,b)=>a-b)[x.length>>1];
const timings=[];
// Detached pure-function batches, without observers or per-call timers.
// Input resets happen outside the timed intervals. Mutable crossings and
// settled overlap fixtures are reported separately.
if (process.env.BENCH !== '0') for(const [name,seedBodies] of [fixtures[0],fixtures[1],fixtures[6]]){
 const old=context(source,()=>false,false),cur=context(candidate,()=>false,false);
 function run(env,iters){const bodies=Array.from({length:iters},()=>seedBodies.map(clone));env.w.softPairsReport.contacts=env.w.softPairsReport.impulse=env.w.softPairsReport.depth=0;const start=performance.now();for(let i=0;i<iters;i++)env.w.softPairsEdges(bodies[i][0],bodies[i][1],1/720);return {ms:performance.now()-start,contacts:env.w.softPairsReport.contacts};}
 for(let warm=0;warm<3;warm++){run(old,1000);run(cur,1000);}
 const rounds=[];for(let r=0;r<12;r++){let a,b;if(r%2){b=run(cur,3000);a=run(old,3000);}else{a=run(old,3000);b=run(cur,3000);}assert.equal(a.contacts,b.contacts);rounds.push({baselineMs:a.ms,candidateMs:b.ms});}
 const baselineMs=median(rounds.map(r=>r.baselineMs)),candidateMs=median(rounds.map(r=>r.candidateMs));timings.push({name,iterationsPerRound:3000,baselineMs,candidateMs,ratio:candidateMs/baselineMs,rounds});
}
const report={schema:'sluice-soft-pairs-equivalence-v1',sources,fixtureCount:fixtures.length,
  comparisons,successful,patchCalls,audioCalls,earlyReturns,bitExact:true,
  arrayComparison:'typed-array bytes for px/py/ox/oy; signed zero and noncanonical NaN payload fixtures included',
  benchmarkEnabled:process.env.BENCH!=='0',timings,
  limitations:'CPU-only isolated actual pair solver. Differential includes mutable A and B, interleaving skins, degenerates, terrain masking, early patch returns and exact audio observations; post-step orientation/self-skin/terrain helpers stubbed. No native game trajectory or FPS claim.'};
const reportPath=saveReport(report,'/tmp/sluice-soft-pairs-equivalence');
console.log(JSON.stringify({...report,reportPath,timings:timings.map(({rounds,...value})=>value)},null,2));
