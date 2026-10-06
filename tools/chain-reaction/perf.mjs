import { toolLock } from './core.mjs';
import { readFile, open, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fixtures } from './core.mjs';
import { serve, browserRun } from './browser.mjs';
const release=await toolLock();
const local=process.env.CHAIN_REACTION_RESEARCH;
if(!local)throw Error('Set CHAIN_REACTION_RESEARCH');
const lockPath=resolve(local,'performance.lock');let lock,server;
function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)];}
try {
  lock=await open(lockPath,'wx');await lock.writeFile(String(process.pid));
  server=await serve(local);
  const busy=(await fixtures()).find(f=>f.name==='busy');
  const profiles=[];
  await browserRun('chromium',async browser=>{
    for(const profile of [{width:1440,height:900,throttle:1},{width:844,height:390,throttle:4}]) {
      const runs=[];
      for(let n=0;n<5;n++) {
        const page=await browser.newPage({viewport:{width:profile.width,height:profile.height}});
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.throttle});
        await page.goto(server.url+'/local/chain-reaction-lab.html');await page.waitForFunction(()=>window.ChainReactionLab?.ready);
        const result=await page.evaluate(async fixture=>{
          ChainReactionLab.settings.paused=true;ChainReactionLab.settings.externalFrames=true;
          const sim=await ChainReaction.physics.create(fixture), samples=[],physicsSamples=[], gpuSamples=[],frameIntervals=[],queries=[];let last=null;
          const canvas=document.getElementById('look'), gl=canvas.getContext('webgl2'), ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
          let query=null;
          try {
            for(let n=0;n<300;n++) {
              const now=await new Promise(requestAnimationFrame);if(last!==null)frameIntervals.push(now-last);last=now;
              for(let k=queries.length-1;k>=0;k--){const q=queries[k];if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpuSamples.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1000000);gl.deleteQuery(q);queries.splice(k,1);}}
              const start=performance.now();sim.step(4);physicsSamples.push(performance.now()-start);
              // Exact-time render drives the full near scene under the same frame budget.
              ChainReactionLab.stress(fixture,sim.state());
              if(ext){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}
              ChainReactionLab.renderCurrent();
              if(ext){gl.endQuery(ext.TIME_ELAPSED_EXT);}
              samples.push(performance.now()-start);
              if(ext){queries.push(query);query=null;}
            }
            return {samples,physicsSamples,gpuSamples,frameIntervals,scene:ChainReactionLab.metrics(),renderer:gl.getParameter(gl.RENDERER)};
          } finally {if(query)gl.deleteQuery(query);for(const q of queries)gl.deleteQuery(q);sim.dispose();}
        },busy);
        runs.push({run:n+1,frameP95:percentile(result.frameIntervals,.95),workP95:percentile(result.samples,.95),physicsP95:percentile(result.physicsSamples,.95),gpuP95:result.gpuSamples.length?percentile(result.gpuSamples,.95):null,gpuSamples:result.gpuSamples.length,drawCalls:result.scene.drawCalls,triangles:result.scene.triangles});
        await page.close();
      }
      profiles.push({profile,runs,medianFrameP95:percentile(runs.map(r=>r.frameP95),.5),medianWorkP95:percentile(runs.map(r=>r.workP95),.5),medianPhysicsP95:percentile(runs.map(r=>r.physicsP95),.5),medianGpuP95:runs.every(r=>r.gpuP95!==null)?percentile(runs.map(r=>r.gpuP95),.5):null});
    }
  });
  console.log(JSON.stringify(profiles,null,2));
  await writeFile(resolve(local,'evidence/performance.json'),JSON.stringify(profiles,null,2)+'\n');
} finally {if(server)await server.close();if(lock){await lock.close();await unlink(lockPath);}await release();}
