import { toolLock } from './core.mjs';
import { fixtures, isolation, validate, deadline, physics } from './core.mjs';
const release=await toolLock();
const clear=deadline(300000);
try {
  const report=[];
  for (const original of await fixtures()) for(const mirrored of [false,true]) {
    const fixture=mirrored?physics.mirror(original):original;
    const result=await isolation(fixture), failures=validate(fixture,result);
    const second=await isolation(fixture);
    if(second.hash!==result.hash) failures.push({type:'determinism'});
    report.push({name:fixture.name,mirrored,bodies:fixture.parts.filter(p=>!p.fixed).length,ticks:result.ticks,hash:result.hash,maxJointError:result.maxJointError,maxRopeRatio:result.maxRopeRatio,failures});
  }
  console.log(JSON.stringify(report,null,2));
  if(report.some(r=>r.failures.length)) process.exitCode=1;
} finally { clear(); await release(); }
