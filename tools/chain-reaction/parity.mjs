import { toolLock } from './core.mjs';
import { fixtures, run, physics, hash } from './core.mjs';
import { serve, browserRun } from './browser.mjs';
import { massCases } from './materials.mjs';
import { measureLimits, railDefinition } from './limits.mjs';
const release=await toolLock();
const definitions=(await fixtures()).flatMap(f=>[f,{...physics.mirror(f),name:f.name+' mirrored'}]), expected=await Promise.all(definitions.map(f=>run(f))), report=[];
const limits=await measureLimits();
const server=await serve();
try {
  for(const engine of ['chromium','webkit']) {
    await browserRun(engine,async browser=>{
      const page=await browser.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(server.url+'/spike.html');
      for(const fixture of definitions) {
        const actual=await page.evaluate(async definition=>{
          const sim=await ChainReaction.physics.create(definition);
          try {
            sim.step(definition.ticks);
            const digest=await crypto.subtle.digest('SHA-256',sim.snapshot());
            return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
          } finally {sim.dispose();}
        },fixture);
        const reference=expected.find(r=>r.name===fixture.name).hash;
        report.push({engine,version:browser.version(),fixture:fixture.name,hash:actual,expected:reference,pass:actual===reference});
      }
      const masses=await page.evaluate(samples=>samples.map(s=>ChainReaction.mass.properties(s.material,s.geometry)),massCases);
      const massHash=hash(JSON.stringify(masses)),massExpected=hash(JSON.stringify(massCases.map(s=>s.expected)));
      report.push({engine,version:browser.version(),fixture:'mass models',cases:massCases.length,hash:massHash,expected:massExpected,pass:massHash===massExpected});
      for(const sample of limits.rails){
        const actual=await page.evaluate(async ({definition,ticks})=>{
          const sim=await ChainReaction.physics.create(definition);
          try{sim.step(ticks);const digest=await crypto.subtle.digest('SHA-256',sim.snapshot());return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}finally{sim.dispose();}
        },{definition:railDefinition(sample.entry,sample.mirrored),ticks:sample.crossing.tick});
        report.push({engine,version:browser.version(),fixture:'rail '+sample.index+(sample.mirrored?' mirrored':''),hash:actual,expected:sample.snapshotHash,pass:actual===sample.snapshotHash});
      }
      if(errors.length) throw Error(errors.join('\n'));
    });
  }
  console.log(JSON.stringify(report,null,2));
  if(report.some(r=>!r.pass))process.exitCode=1;
} finally {await server.close();await release();}
