#!/usr/bin/env node
// Audit raw moving-boundary repeats without starting another GPU process.
// node tools/check-water-native-repeat.mjs /absolute/capture [--expect-equal]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

assert(process.argv[2], 'Supply the REPEAT_NATIVE capture directory');
const folder=path.resolve(process.argv[2]);
const report=JSON.parse(fs.readFileSync(path.join(folder,'report.json')));
assert.deepEqual(report.errors,[], 'No browser errors');
assert(report.rows.length>0, 'At least one seed was captured');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const rows=[];
for(const row of report.rows){
  assert.equal(row.runs.length,2, 'Two fresh-document repeats per seed');
  const [a,b]=row.runs.map(run=>run.steps);
  assert.equal(a.length,b.length);assert(a.length>=2, 'Initial state plus native updates');
  const frames=[];
  for(let i=0;i<a.length;i++){
    assert.equal(a[i].frame,b[i].frame);
    const left=a[i].capture,right=b[i].capture;
    const names=Object.keys(left.hashes).sort();
    assert.deepEqual(names,Object.keys(right.hashes).sort());
    for(const key of ['clock','dt','count','mutationSeq','readbackGeneration','readbackAppliedTime','settings','loaded'])
      assert.deepEqual(left.state[key],right.state[key], 'Equal step input: '+key);
    const different=[];
    let position=null;
    for(const name of names){
      const read=capture=>{
        const file=path.resolve(folder,capture.folder,name+'.bin');
        assert(file.startsWith(folder+path.sep));
        const bytes=fs.readFileSync(file);
        assert.equal(hash(bytes),capture.hashes[name], 'Captured hash: '+file);
        return bytes;
      };
      const l=read(left),r=read(right);assert.equal(l.length,r.length);
      if(!l.equals(r))different.push(name);
      if(name==='pos'){
        assert.equal(l.length,left.state.count*16);
        const maxima=[0,0,0,0],sums=[0,0,0,0],changed=[0,0,0,0];
        for(let offset=0;offset<l.length;offset+=4){
          const x=l.readFloatLE(offset),y=r.readFloatLE(offset),lane=offset/4%4;
          assert(Number.isFinite(x)&&Number.isFinite(y), 'Finite native position and velocity');
          const delta=Math.abs(x-y);maxima[lane]=Math.max(maxima[lane],delta);sums[lane]+=delta*delta;
          if(delta)changed[lane]++;
        }
        position={lanes:['x','y','vx','vy'],maximumAbsoluteDifference:maxima,
          rootMeanSquareDifference:sums.map(sum=>Math.sqrt(sum/left.state.count)),changedParticles:changed};
      }
    }
    if(i===0)assert.deepEqual(different,[], 'Identical initial native buffers and packed inputs');
    for(const name of ['params','simParams','gameParams','geometry','flag'])
      assert(!different.includes(name), 'Equal prescribed inputs: '+name);
    frames.push({frame:a[i].frame,clock:left.state.clock,different,position});
  }
  rows.push({seed:row.seed,frames});
}
const result={schema:'water-machines-native-repeat-audit-v1',
  scope:'Identical prescribed moving-slime poses, packed inputs and initial buffers. Repeatability does not certify physical accuracy or normal interactive playback.',
  inputReportSHA256:hash(fs.readFileSync(path.join(folder,'report.json'))),
  captureConfig:report.captureConfig || null,
  allCapturedStatesRepeat:rows.every(row=>row.frames.every(frame=>frame.different.length===0)),rows};
fs.writeFileSync(path.join(folder,'repeat-audit.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({allCapturedStatesRepeat:result.allCapturedStatesRepeat,seeds:rows.map(row=>row.seed),
  maximumVelocityDifference:Math.max(...rows.flatMap(row=>row.frames.flatMap(frame=>frame.position.maximumAbsoluteDifference.slice(2))))}));
if(process.argv.includes('--expect-equal'))assert(result.allCapturedStatesRepeat, 'Every captured native buffer repeats byte for byte');
