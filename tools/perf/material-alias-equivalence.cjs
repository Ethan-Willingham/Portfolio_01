// Exact material regression using real disc meshes with mixed cache shapes.
// BASE_REF changes the frozen reference; BENCH=1 adds an isolated CPU comparison.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const core = fs.readFileSync('js/sluice/340-jello.js', 'utf8');
const material = fs.readFileSync('js/sluice/344-soft-material.js', 'utf8');
const baseline=process.env.BASE_REF||'4219c6f6c5e2bf86316d5e14ac156720f0184598';
const original=execFileSync('git',['show',baseline+':js/sluice/344-soft-material.js'],{encoding:'utf8'});
function engine(source) {
  return new Function('window', 'TILE', 'GRAVITY', `
    var COLS=320,TOTAL_ROWS=500,softProjectEnabled=true,location=window.location;
    function tileAt(){return null;}
    ${core}\n${source}
    return {build:jelloBuildDisc,solve:softMaterialSolve,damp:softMaterialDamp};
  `)({location:{search:''}},32,600);
}
const before=engine(original),after=engine(material);
function bodies(e) {
  return Array.from({length:8},(_,i)=>{
    const b=e.build(100+i*70,100,22+i,'slime');
    // Deliberately mix the cache fields added by terrain, intent, and presentation.
    if(i%2)b.surfaceSlime={};
    if(i%3)b._guardPX=new Float64Array(b.n);
    if(i%4)b._orientClear={valid:false};
    if(i%2)b._softPX=new Float64Array(b.n);
    if(i%3===0)b._softClearX=new Float64Array(b.ringN);
    if(i%4===0)b._intentTopology={};
    for(let p=0;p<b.n;p++){
      b.px[p]+=Math.sin(p*1.17+i)*2;b.py[p]+=Math.cos(p*.83-i)*3;
      b.ox[p]=b.px[p]-Math.sin(p*1.33)*.2;b.oy[p]=b.py[p]-Math.cos(p*.91)*.4;
    }
    return b;
  });
}
const oldBodies=bodies(before),newBodies=bodies(after);
const arrays=['px','py','ox','oy','sLambda','_materialGX','_materialGY'];
let checks=0;
for(let step=0;step<100;step++)for(let i=0;i<8;i++){
  const h=[1/360,1/720,1/240][step%3],a=oldBodies[i],b=newBodies[i];
  if(step%7===0)for(const body of [a,b]){
    body.px[step%body.n]+=.07;body.py[(step+3)%body.n]-=.05;
    body.sRest[step%body.springN]*=1.0001;
  }
  before.solve(a,h);after.solve(b,h);before.damp(a,h);after.damp(b,h);
  for(const name of arrays)assert.deepEqual(Buffer.from(b[name].buffer),Buffer.from(a[name].buffer),`${step}/${i}/${name}`);
  assert.equal(b.volLambda,a.volLambda);checks++;
}
console.log(JSON.stringify({passed:true,exactMixedBodySteps:checks}));
if(process.env.BENCH==='1'){
  const list=[bodies(before),bodies(after)],engines=[before,after];
  function time(which,n){const e=engines[which],start=performance.now();for(let s=0;s<n;s++)for(const b of list[which]){e.solve(b,1/360);e.damp(b,1/360);}return performance.now()-start;}
  time(0,1000);time(1,1000);
  const samples=[[],[]];
  for(let run=0;run<7;run++)for(const which of run%2?[1,0]:[0,1])samples[which].push(time(which,3000));
  const median=a=>a.slice().sort((x,y)=>x-y)[3];
  console.log(JSON.stringify({benchmark:'3000 solve+damp passes across eight mixed real discs',beforeMs:median(samples[0]),afterMs:median(samples[1]),samples}));
}
