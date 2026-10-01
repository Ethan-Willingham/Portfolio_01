// Untimed exact production-closure gate for query-range support pruning.
// No performance clocks, browser, GPU, or production-file writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const directory=path.dirname(fileURLToPath(import.meta.url));
const sourceRoot=path.resolve(directory,'../..');
const repoRoot=process.env.REPO_ROOT?path.resolve(process.env.REPO_ROOT):fs.existsSync(path.join(sourceRoot,'js/sluice/159-snow-physics.js'))?sourceRoot:process.cwd();
const paths={before:path.resolve(process.env.BEFORE||path.join(directory,'fixtures/snow-support-v133.js')),after:path.resolve(process.env.AFTER||path.join(repoRoot,'js/sluice/159-snow-physics.js'))};
const sources=Object.fromEntries(Object.entries(paths).map(([label,file])=>[label,fs.readFileSync(file,'utf8')]));
const sha=value=>createHash('sha256').update(value).digest('hex');
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const bodies={};
function build(source,label){
  const start=source.indexOf('  function snowContactRadius()'),end=source.indexOf('  function snowInsertContact',start);
  assert(start>=0&&end>start,'Production support closure anchors');
  const original=source.slice(start,end);bodies[label]=sha(original);let body=original;
  const rangePruningPresent=label==='after'&&body.includes('var pruneCells = cell >= 1');
  const once=(old,replacement)=>{assert.equal(body.split(old).length,2,'Unique instrumentation anchor '+old.slice(0,60));body=body.replace(old,replacement);};
  once('    var heads = new Map(), bed = new Map(), points = snowSupportPoints, next = snowSupportNext, queue = snowSupportQueue;',`    var heads = new Map(), bed = new Map(), points = snowSupportPoints, next = snowSupportNext, queue = snowSupportQueue;
    heads.get=function(key){operations.headsGet++;return Map.prototype.get.call(this,key);};
    heads.set=function(key,value){operations.headsSet++;return Map.prototype.set.call(this,key,value);};`);
  once('      if (types[i] !== 5) continue;','      operations.particleLoop++;if (types[i] !== 5) continue;operations.snowGrains++;');
  once('        queue[queueCount++] = n; next[n] = -1;','        operations.rootGrains++;queue[queueCount++] = n; next[n] = -1;');
  once('    for (var q = 0; q < queueCount; q++) {','    for (var q = 0; q < queueCount; q++) {operations.queueLoop++;');
  once('        var nearKey = (row + r) * width + col + c;','        operations.bucketQueries++;var nearKey = (row + r) * width + col + c;');
  once('        while (current !== undefined && current >= 0) {','        while (current !== undefined && current >= 0) {operations.candidateChecks++;');
  once('          if (dx * dx + dy * dy <= reach2) {','          if (dx * dx + dy * dy <= reach2) {operations.reachedViaLink++;');
  once('          } else previous = current;','          } else {operations.failedChecks++;previous = current;}');
  if(rangePruningPresent){
    assert(body.includes('var pruneCells = cell >= 1'),'Candidate contains guarded pruning');
    once('    for (var q = 0; q < queueCount; q++) {operations.queueLoop++;','    operations.pruneBuildEnabled=pruneCells;for (var q = 0; q < queueCount; q++) {operations.queueLoop++;');
    once('      if (pruneCells && col > 0 && col < width - 1) {','      if (pruneCells && col > 0 && col < width - 1) {operations.prunedQueries++;');
    once('      for (var r = rMin; r <= rMax; r++) for (var c = cMin; c <= cMax; c++) {',`      verifySkipped(heads,points,next,row,col,width,reach2,x,y,rMin,rMax,cMin,cMax);
      for (var r = rMin; r <= rMax; r++) for (var c = cMin; c <= cMax; c++) {`);
  }
  once('    return bed;',`    return {bed:bed,heads:Array.from(heads),points:points,next:next,queue:queue,pointCount:pointCount,queueCount:queueCount,solidCalls:new Float64Array(solidCalls),operations:operations};`);
  return new Function(`var LIQUID_CELL,LIQUID_SNOW_DENSITY,COLS,TILE,liquidCount,liquidType,liquidX,liquidY,liquidWorldSolidAt,solidCalls,operations;
    function verifySkipped(heads,points,next,row,col,width,reach2,x,y,rMin,rMax,cMin,cMax){
      for(var r=-1;r<=1;r++)for(var c=-1;c<=1;c++){
        if(r>=rMin&&r<=rMax&&c>=cMin&&c<=cMax)continue;
        operations.skippedBuckets++;
        var current=Map.prototype.get.call(heads,(row+r)*width+col+c);
        while(current!==undefined&&current>=0){
          operations.skippedCandidates++;
          var dx=x-points[current*2],dy=y-points[current*2+1];
          if(dx*dx+dy*dy<=reach2)throw Error('Pruned bucket contains original accepted contact');
          current=next[current];
        }
      }
    }
    ${body}
    return {rangePruningPresent:${JSON.stringify(rangePruningPresent)},run:function(f){
      var k=f.constants||{};LIQUID_CELL=k.LIQUID_CELL??2.5;LIQUID_SNOW_DENSITY=k.LIQUID_SNOW_DENSITY??3.2;COLS=k.COLS??320;TILE=k.TILE??32;
      liquidType=f.type;liquidX=f.x;liquidY=f.y;liquidCount=f.type.length;
      var callback=f.solidFactory?f.solidFactory():f.solid;
      solidCalls=[];liquidWorldSolidAt=function(x,y){solidCalls.push(x,y);return callback(x,y);};
      operations={particleLoop:0,snowGrains:0,rootGrains:0,queueLoop:0,headsGet:0,headsSet:0,bucketQueries:0,candidateChecks:0,reachedViaLink:0,failedChecks:0,prunedQueries:0,skippedBuckets:0,skippedCandidates:0,pruneBuildEnabled:false};
      return snowBuildSupport();
    }};`)();
}
const before=build(sources.before,'before'),after=build(sources.after,'after');
const defaults={LIQUID_CELL:2.5,LIQUID_SNOW_DENSITY:3.2,COLS:320,TILE:32};
function constants(f){return {...defaults,...f.constants};}
function dimensions(f){const k=constants(f),reach=k.LIQUID_CELL/Math.sqrt(k.LIQUID_SNOW_DENSITY)+.25,cell=Math.max(k.LIQUID_CELL,reach);return {reach,cell,width:Math.ceil(k.COLS*k.TILE/cell)+1};}
function rooted(points,roots=[0],k){
  const f={type:new Uint8Array(points.length).fill(5),x:new Float64Array(points.map(p=>p[0])),y:new Float64Array(points.map(p=>p[1])),constants:k};
  const marked=new Set(roots);
  f.solidFactory=()=>{let cursor=0;return(x,y)=>{while(cursor<f.type.length&&f.type[cursor]!==5)cursor++;const index=cursor++;assert(index<f.type.length,'One root probe per snow input');const kk=constants(f);assert(Object.is(x,f.x[index]),'Root probe x');assert(Object.is(y,f.y[index]+(kk.LIQUID_CELL/Math.sqrt(kk.LIQUID_SNOW_DENSITY)*.5+.3)),'Root probe y');return marked.has(index);};};
  return f;
}
let seed=48271;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function layered(n,kind='layered',layers=7){
  const f={type:new Uint8Array(n).fill(5),x:new Float64Array(n),y:new Float64Array(n),solid:(x,y)=>y>=128};
  const columns=Math.max(1,Math.ceil(n/layers)),{reach,cell,width}=dimensions(f);
  for(let i=0;i<n;i++){
    f.x[i]=200+(i%columns)*1.4;f.y[i]=127.29-Math.floor(i/columns)*1.4;
    if(kind==='cloud')f.y[i]-=200;
    if(kind==='mixed')f.type[i]=i%6;
    if(kind==='random'){f.x[i]=random()*800;f.y[i]=random()*250-50;}
    if(kind==='sparse'){f.x[i]*=4;f.y[i]=127.29-Math.floor(i/columns)*12;}
    if(kind==='compressed'){f.x[i]=200+(i%columns)*.03;f.y[i]=127.29-Math.floor(i/columns)*.03;}
    if(kind==='duplicate'&&i%3){f.x[i]=f.x[i-i%3];f.y[i]=f.y[i-i%3];}
    if(kind==='curved')f.solid=(x,y)=>y>=128+8*Math.sin(x/55);
    if(kind==='negativeY'){f.y[i]-=400;f.solid=(x,y)=>y>=-272;}
    if(kind==='negativeX')f.x[i]-=1500;
    if(kind==='worldedge')f.x[i]=(i%columns)*1.4;
    if(kind==='threshold')f.y[i]=127.29-Math.floor(i/columns)*(reach+(i%2?1e-10:-1e-10));
    if(kind==='alias'){f.x[i]=(i%2?width*cell:0)+(i%columns)*1.4;f.y[i]-=(i%2?cell:0);}
  }
  return f;
}
let solves=0,checks=0,skippedCandidates=0,activeBuilds=0,fallbackBuilds=0;
function gate(f,name,expect){
  const inputs=[f.type,f.x,f.y].map(a=>Buffer.from(bytes(a)));
  const a=before.run(f),b=after.run(f);solves++;
  assert.deepEqual([...b.bed.keys()],[...a.bed.keys()],name+' ordered bed keys');checks++;
  for(const[key,values]of a.bed){assert.equal(bytes(new Float64Array(values)).compare(bytes(new Float64Array(b.bed.get(key)))),0,name+' ordered bed '+key);checks++;}
  assert.deepEqual(b.heads,a.heads,name+' ordered residual heads');checks++;
  for(const key of['points','next','queue','solidCalls']){assert.equal(bytes(a[key]).compare(bytes(b[key])),0,name+' bytes '+key);checks++;}
  for(let i=0;i<inputs.length;i++){assert.equal(inputs[i].compare(bytes([f.type,f.x,f.y][i])),0,name+' unchanged input '+i);checks++;}
  for(const run of[a,b]){assert.equal(run.operations.rootGrains+run.operations.reachedViaLink,run.queueCount,name+' root/link conservation');assert.equal(run.operations.candidateChecks,run.operations.reachedViaLink+run.operations.failedChecks,name+' candidate decisions');assert.equal(run.operations.snowGrains,run.solidCalls.length/2,name+' one terrain query per snow grain');checks+=3;}
  if(f.expectedBed){assert.deepEqual([...a.bed],f.expectedBed,name+' baseline actual expectedBed');assert.deepEqual([...b.bed],f.expectedBed,name+' candidate actual expectedBed');checks+=2;}
  if(expect?.fallback){assert.equal(b.operations.pruneBuildEnabled,false,name+' whole-build fallback');checks++;}
  if(expect?.active&&after.rangePruningPresent){assert.equal(b.operations.pruneBuildEnabled,true,name+' prune-eligible build');assert(b.operations.prunedQueries>0,name+' actual bounded traversal');checks+=2;}
  if(b.operations.pruneBuildEnabled)activeBuilds++;else fallbackBuilds++;
  skippedCandidates+=b.operations.skippedCandidates;
  const groundQueryLedger={beforeCalls:a.solidCalls.length/2,afterCalls:b.solidCalls.length/2,beforeSHA256:sha(bytes(a.solidCalls)),afterSHA256:sha(bytes(b.solidCalls)),exact:true};
  const output={name,count:f.type.length,reached:a.queueCount,before:a.operations,after:b.operations,groundQueryLedger,expectedBedExact:!!f.expectedBed};return output;
}
for(const layers of[3,7,12,20,32])gate(layered(14000,'layered',layers),'layered14k-'+layers,{active:true});
for(const kind of['layered','cloud','mixed','random','sparse','compressed','duplicate','curved','negativeY','negativeX','worldedge','threshold','alias'])for(const n of[0,1,17,128,1536])gate(layered(n,kind),kind+'-'+n,(kind==='negativeX'&&n>0)||(kind==='alias'&&n>1)?{fallback:true}:undefined);

// Representable Number and float32 neighbors on both sides of contacts and cells.
const word=new DataView(new ArrayBuffer(8));
function adjacent(value,direction){
  if(Number.isNaN(value)||value===(direction>0?Infinity:-Infinity))return value;
  if(value===0)return direction>0?Number.MIN_VALUE:-Number.MIN_VALUE;
  word.setFloat64(0,value,false);let bits=word.getBigUint64(0,false);bits+=(value>0)===(direction>0)?1n:-1n;word.setBigUint64(0,bits,false);return word.getFloat64(0,false);
}
function around(value){return[adjacent(value,-1),value,adjacent(value,1)];}
let acceptedThresholds=0,rejectedThresholds=0;
const {reach,cell,width}=dimensions({});
for(const baseX of[20*cell,20*cell+reach,1048500])for(const baseY of[-20*cell,0,20*cell])for(const x of around(baseX))for(const y of around(baseY)){
  for(const angle of[0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.5])for(const distance of around(reach)){
    const other=[x+Math.cos(angle)*distance,y+Math.sin(angle)*distance],f=rooted([[x,y],other],[0],baseX>10240?{COLS:65536}:undefined);
    const dx=f.x[0]-f.x[1],dy=f.y[0]-f.y[1];if(dx*dx+dy*dy<=reach*reach)acceptedThresholds++;else rejectedThresholds++;
    gate(f,'threshold-cell-'+solves);
  }
}
for(const x of[0,-0,cell,width*cell-cell,width*cell,adjacent(width*cell,-1)])for(const y of[-1000,0,1000])for(const distance of around(reach))gate(rooted([[x,y],[x+distance,y]],[],undefined),'canonical-or-alias-edge-'+solves,x>=width*cell?{fallback:true}:undefined);
for(const origin of[1,cell,25,1048500])for(const dy of[-1000,0,1000])for(const sign of[-1,1]){
  const points=Array.from({length:29},(_,i)=>[origin+(i%7)*.42,dy+sign*Math.floor(i/7)*.42]);
  gate(rooted(points,[0],origin>10240?{COLS:65536}:undefined),'small-contact-chain-'+solves,{active:true});
}
for(const k of[{LIQUID_CELL:1},{LIQUID_CELL:1.1},{LIQUID_CELL:3.7},{LIQUID_SNOW_DENSITY:1},{LIQUID_SNOW_DENSITY:16}]){
  const d=dimensions({constants:k});
  for(const x of around(20*d.cell))for(const y of around(-20*d.cell))for(const radius of around(d.reach))for(const sign of[-1,1]){
    const f=rooted([[x,y],[x+radius*sign,y]], [0], k);gate(f,'different-cell-reach-'+solves,{active:true});
    const g=rooted([[x,y],[x,y+radius*sign]], [0], k);g.x=new Float32Array(g.x);g.y=new Float32Array(g.y);gate(g,'float32-cell-reach-'+solves,{active:true});
  }
}
for(const x of around(1048576))for(const y of[...around(-1048576),...around(1048576)]){
  const f=rooted([[x,y],[x-1,y]],[0],{COLS:65536});gate(f,'domain-limits-'+solves,x>1048576||Math.abs(y)>1048576?{fallback:true}:{active:true});
}
for(const marker of[NaN,Infinity,-Infinity,-1,1048576+1,Number.MAX_VALUE])for(const rootedMarker of[false,true]){
  const f=rooted([[200,125],[marker,124],[201,125]],rootedMarker?[0,1]:[0]);gate(f,'malformed-x-'+String(marker)+'-root'+rootedMarker,{fallback:true});
  const g=rooted([[200,125],[201,marker],[201,125]],rootedMarker?[0,1]:[0]);gate(g,'malformed-y-'+String(marker)+'-root'+rootedMarker,marker===-1?undefined:{fallback:true});
}
for(const payload of[0x7ff8000000000001n,0x7ff0000000000001n,0xfff8000000000065n])for(const axis of['x','y']){
  const f=rooted([[200,125],[201,124],[202,125]],[0]);new DataView(f[axis].buffer).setBigUint64(8,payload,true);gate(f,'NaN-payload-'+axis+'-'+payload.toString(16),{fallback:true});
}
for(const k of[{LIQUID_CELL:0},{LIQUID_CELL:.5},{LIQUID_SNOW_DENSITY:0},{LIQUID_SNOW_DENSITY:-1},{COLS:Infinity},{TILE:NaN},{COLS:0},{COLS:1,TILE:1}])gate(rooted([[200,125],[201,125]],[0],k),'unsupported-constants-'+JSON.stringify(k),{fallback:true});
for(const n of[30000,0,1,64,7,17000,3,1024,0])gate(layered(n,n%2?'mixed':'layered',12),'capacity-'+n);

let actualCapture=null;
if(process.env.FIXTURE){
// Captured ordinary state: use the recorded terrain-root oracle in its
// original input order, then require the independently recorded ordered bed.
const fixturePath=path.resolve(process.env.FIXTURE);
const fixtureBytes=fs.readFileSync(fixturePath),actual=JSON.parse(fixtureBytes.toString('utf8'));
assert.equal(actual.schema,'sluice-snow-support-fixture-v1');assert(Number.isSafeInteger(actual.count)&&actual.count>=0);for(const key of['types','x','y','groundRoots'])assert.equal(actual[key].length,actual.count,'Captured '+key+' length');
const actualFixture={type:new Uint8Array(actual.types),x:new Float64Array(actual.x),y:new Float64Array(actual.y),constants:actual.constants,expectedBed:actual.expectedBed};
actualFixture.solidFactory=()=>{let cursor=0;return(x,y)=>{while(cursor<actual.count&&actual.types[cursor]!==5)cursor++;const i=cursor++;assert(i<actual.count);assert(Object.is(x,actual.x[i]));const k=actual.constants;assert(Object.is(y,actual.y[i]+(k.LIQUID_CELL/Math.sqrt(k.LIQUID_SNOW_DENSITY)*.5+.3)));return !!actual.groundRoots[i];};};
const actualSnowCount=actual.types.reduce((count,type)=>count+(type===5?1:0),0),actualRootCount=actual.types.reduce((count,type,i)=>count+(type===5&&actual.groundRoots[i]?1:0),0);
const actualResult=gate(actualFixture,'captured-'+actual.count+'-liquids-'+actualSnowCount+'-snow');
assert.equal(actualResult.before.rootGrains,actualRootCount,'Captured root flags matched baseline');assert.equal(actualResult.after.rootGrains,actualRootCount,'Captured root flags matched candidate');checks+=2;
actualResult.groundQueryLedger.recordedSnowCount=actualSnowCount;actualResult.groundQueryLedger.recordedRootCount=actualRootCount;actualResult.groundQueryLedger.recordedInputOrderValidated=true;
actualCapture={fixturePath,fixtureSHA256:sha(fixtureBytes),result:actualResult};
}
assert(acceptedThresholds>0&&rejectedThresholds>0,'Threshold suite exercises both decisions');
const report={schema:'sluice-snow-support-range-equivalence-v1',pass:true,untimed:true,noBrowser:true,noGPU:true,solves,checks,rangePruningPresent:after.rangePruningPresent,activeBuilds,fallbackBuilds,skippedCandidates,acceptedThresholds,rejectedThresholds,paths,sourceSHA256:Object.fromEntries(Object.entries(sources).map(([k,s])=>[k,sha(s)])),bodySHA256:bodies,actualCapture,caseSummary:'Frozen production support closure; ordered bed/heads, complete scratch/queue/terrain-query bytes, unchanged inputs; Number and f32 thresholds and ULP/cell boundaries; negative y, world edges, alias fallback; malformed/constants; repeated capacity.',limitation:'Covers the extracted support closure. Review production-fragment changes outside it separately. Captured data is optional; no temporary-path fixture is required.'};
if(process.env.DUMP)fs.writeFileSync(process.env.DUMP,JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
