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
const relative='js/sluice/340-jello.js';
const before=readBefore(relative),after=readAfter(relative);
const src=after.source;
const surfacePath=path.join(ROOT,'js/sluice/347-surface-slimes.js');
const surface=fs.readFileSync(surfacePath,'utf8');
const sources={before:before.provenance,after:after.provenance,
  surface:{path:surfacePath,sha256:sha(surface)},tool:{path:fileURLToPath(import.meta.url),sha256:sha(fs.readFileSync(fileURLToPath(import.meta.url),'utf8'))}};
function fn(s,n){const a=s.indexOf('  function '+n+'(');assert(a>=0,n);const b=s.indexOf('\n  function ',a+1);return s.slice(a,b<0?s.length:b).trimEnd();}
const original=fn(before.source,'jelloPointInRing'),carry=fn(after.source,'jelloPointInRing');
for(const text of [original,carry]) new vm.Script('('+text+'\n)');
if(process.env.DRY_RUN==='1') {
  console.log(JSON.stringify({schema:'sluice-jello-ring-query-v1',dryRun:true,sources,
    fixturePlan:{naturalBodies:5,syntheticBodies:2006,queryClasses:['random','vertex','edge midpoint','epsilon','NaN','infinite','reversed membership'],bench:process.env.BENCH!=='0'},
    fixturesExecuted:false,timingsExecuted:false,browserLaunched:false},null,2));
  process.exit(0);
}
const ctx={Math,Float64Array,Float32Array,Int32Array,Int8Array,ENABLE_JELLO:true,TILE:32,JELLO_NPT:3,JELLO_H:1/240,JELLO_MAX_POINTS:6000,JELLO_MAX_BODIES:64,JELLO_CONTACT_R_FRAC:.5,JELLO_RENDER_HUE:158,jelloCount:0,jelloBodies:[],skySlimeSerial:1,surfaceSlimeHues:[133,284,190,32,333],skySlimeClamp:(x,l,h)=>Math.max(l,Math.min(h,x)),jelloHueForType:()=>133,jelloInstallSpringHealthMesh:()=>{},jelloShadeAnchors:()=>{},jelloComputeRest:()=>{},jelloUpdateBody:()=>{},surfaceSlimeMotorInit:()=>{},jelloTotalPoints:()=>ctx.jelloBodies.reduce((a,b)=>a+b.n,0)};
vm.createContext(ctx);
vm.runInContext(fn(src,'jelloBuildDisc')+'\n'+fn(surface,'surfaceSlimeBuild'),ctx);
const natural=Array.from({length:5},(_,n)=>ctx.surfaceSlimeBuild(4976+n*70,90,{seed:.08+n*.19,r:22+(.08+n*.19)*5}));
// Only geometry is needed for this pure query. Actual production constructors
// build these point/ring arrays; mesh/material/controller setup is stubbed.
const old=vm.runInNewContext('('+original+'\n)'),cur=vm.runInNewContext('('+carry+'\n)');
let seed=48271;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function body(points){return {px:Float64Array.from(points.map(p=>p[0])),py:Float64Array.from(points.map(p=>p[1])),ring:Int32Array.from(points.map((_,i)=>i)),ringN:points.length};}
const fixtures=natural.slice();
fixtures.push(body([[0,0],[20,0],[20,20],[0,20]]),body([[0,0],[20,20],[0,20],[20,0]]),body([[0,0],[10,0],[20,0],[30,0]]),body([]),body([[1,1]]),body([[1,1],[2,2]]));
for(let t=0;t<2000;t++){const n=3+Math.floor(random()*46),points=[];for(let k=0;k<n;k++){const ang=k/n*Math.PI*2,r=1+random()*50;points.push([(t%3?random()*100:Math.cos(ang)*r)+1e-9*(t%2),(t%3?random()*100:Math.sin(ang)*r)]);}fixtures.push(body(points));}
let comparisons=0,truths=0;
for(const b of fixtures){const xs=Array.from(b.px),ys=Array.from(b.py);const l=Math.min(...xs,0)-4,r=Math.max(...xs,0)+4,t=Math.min(...ys,0)-4,bt=Math.max(...ys,0)+4;
 const queries=Array.from({length:80},()=>[l+random()*(r-l),t+random()*(bt-t)]);
 for(let k=0;k<b.ringN;k++){const j=(k+1)%b.ringN;queries.push([b.px[k],b.py[k]],[(b.px[k]+b.px[j])*.5,(b.py[k]+b.py[j])*.5],[b.px[k]+Number.EPSILON,b.py[k]-Number.EPSILON]);}
 queries.push([NaN,0],[0,NaN],[Infinity,0],[-Infinity,0],[0,Infinity],[0,-Infinity]);
 for(const [x,y] of queries){const a=old(b,x,y),c=cur(b,x,y);assert.equal(c,a);comparisons++;truths+=a;}
 // Reversal and ring membership changes must not preserve stale endpoints.
 b.ring=Int32Array.from(Array.from(b.ring).reverse());for(const [x,y] of queries.slice(0,20)){assert.equal(cur(b,x,y),old(b,x,y));comparisons++;}
}
// Timing uses ordinary 5-resident point/ring arrays and deterministic query
// locations around each body. This is an isolated query benchmark, not FPS.
const queries=natural.map(b=>Array.from({length:256},()=>[b.cx+(random()-.5)*70,b.cy+(random()-.5)*70]));
function timing(f,iterations){let sink=0;const start=performance.now();for(let i=0;i<iterations;i++){const bi=i%5,qi=(i/5|0)&255,q=queries[bi][qi];sink+=f(natural[bi],q[0],q[1]);}return {ms:performance.now()-start,sink};}
if(process.env.BENCH!=='0') for(let r=0;r<3;r++){timing(old,200000);timing(cur,200000);}
const rounds=[];if(process.env.BENCH!=='0') for(let r=0;r<12;r++){let a,b;if(r%2){b=timing(cur,500000);a=timing(old,500000);}else{a=timing(old,500000);b=timing(cur,500000);}assert.equal(a.sink,b.sink);rounds.push({baselineMs:a.ms,candidateMs:b.ms});}
const median=x=>x.slice().sort((a,b)=>a-b)[x.length>>1];const baselineMs=rounds.length?median(rounds.map(r=>r.baselineMs)):null,candidateMs=rounds.length?median(rounds.map(r=>r.candidateMs)):null;
const report={schema:'sluice-jello-ring-query-v1',sources,comparisons,truths,bitExact:true,
  naturalBodies:natural.map(b=>({points:b.n,ring:b.ringN})),
  benchmarkEnabled:process.env.BENCH!=='0',rounds,baselineMs,candidateMs,
  ratio:rounds.length?candidateMs/baselineMs:null,
  limitations:'CPU-only pure query benchmark. Actual production constructors supply geometry, with mesh/material/controller helper setup stubbed. Synthetic deformations cover differential predicates. No full-game trajectory or FPS claim.'};
const reportPath=saveReport(report,'/tmp/sluice-jello-ring-query');
console.log(JSON.stringify({...report,reportPath},null,2));
