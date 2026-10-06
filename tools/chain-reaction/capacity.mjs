// Two independent physics worlds, contact observation, complete near scene, full zoom-out.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT,toolLock} from './core.mjs';
import {materialData,mass} from './materials.mjs';
import {serve,browserRun} from './browser.mjs';
const local=process.env.CHAIN_REACTION_RESEARCH;if(!local)throw Error('Set CHAIN_REACTION_RESEARCH');
const release=await toolLock(),server=await serve(local),report=[];
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.floor((sorted.length-1)*p)];};
function fixture(count){
 const props=mass.properties(materialData.materials.maple,{construction:'box',width:.7,height:.6,depth:.3});
 const parts=[{id:'floor',shape:'box',fixed:true,mount:'bench',x:8,y:-.2,width:18,height:.4}];
 for(let n=0;n<count;n++)parts.push({id:'block'+n,shape:'box',x:2.5+(n%8)*.9,y:.301+Math.floor(n/8)*.61,width:.7,height:.6,...props});
 return {parts,causality:{source:'floor',targets:parts.slice(1).map(p=>p.id),maxRestAngle:.02,maxRestTravel:.01,fallenAngle:1.1,minimumImpulse:1e-8,required:false}};
}
try{
 for(const count of [32,48,64])await browserRun('chromium',async browser=>{
  for(const profile of [{width:1440,height:900,throttle:1},{width:844,height:390,throttle:4}]){
   const runs=[];
   for(let run=1;run<=5;run++){
    const page=await browser.newPage({viewport:{width:profile.width,height:profile.height}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.throttle});
    await page.goto(server.url+'/local/chain-reaction-lab.html');await page.waitForFunction(()=>window.ChainReactionLab?.ready);
    const result=await page.evaluate(async definition=>{
     ChainReactionLab.settings.paused=true;ChainReactionLab.settings.externalFrames=true;
     const sims=[await ChainReaction.physics.create(definition),await ChainReaction.physics.create(definition)];
     // This stack stress case is not a candidate chain. Observe all body contacts without approving its behavior.
     const watches=sims.map(sim=>ChainReaction.causality.watch(sim,definition));
     const display={parts:sims.flatMap((_,k)=>definition.parts.filter(p=>!p.fixed).map(p=>({...p,id:k+'-'+p.id,x:p.x+k*16})))};
     const gl=document.getElementById('look').getContext('webgl2'),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
     if(!ext)throw Error('GPU timing unavailable');const intervals=[],work=[],physics=[],gpu=[],queries=[],active=[];let last=null;
     try{
      for(let frame=0;frame<300;frame++){
       const now=await new Promise(requestAnimationFrame);if(last!==null)intervals.push(now-last);last=now;
       for(let n=queries.length-1;n>=0;n--){const q=queries[n];if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){if(!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(q);queries.splice(n,1);}}
       const start=performance.now();for(let tick=0;tick<4;tick++)for(let k=0;k<2;k++){sims[k].step();watches[k].sample();}physics.push(performance.now()-start);
       const state=sims.flatMap((sim,k)=>sim.state().filter(p=>p.id!=='floor').map(p=>({...p,id:k+'-'+p.id,x:p.x+k*16})));
       active.push(state.filter(p=>!p.sleeping).length);
       ChainReactionLab.stress(display,state);ChainReactionLab.stressView(32+(frame/299)*128);
       const q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);ChainReactionLab.renderCurrent();gl.endQuery(ext.TIME_ELAPSED_EXT);queries.push(q);
       work.push(performance.now()-start);
      }
      return {intervals,work,physics,gpu,active,scene:ChainReactionLab.metrics(),recordedBodies:display.parts.length};
     }finally{for(const q of queries)gl.deleteQuery(q);for(const sim of sims)sim.dispose();}
    },fixture(count));
    if(errors.length)throw Error(errors.join('\n'));if(!result.gpu.length)throw Error('No GPU timings');
    const allActiveFrames=result.active.filter(n=>n===count*2).length;
    if(allActiveFrames<15)throw Error('Too few fully active frames for p95 capacity evidence');
    runs.push({run,allActiveFrames,maxActiveBodies:Math.max(...result.active),frameP95:percentile(result.intervals,.95),workP95:percentile(result.work,.95),physicsP95:percentile(result.physics,.95),gpuP95:percentile(result.gpu,.95),recordedBodies:result.recordedBodies});
    await page.close();
   }
   const measured={countPerWorld:count,worlds:2,profile,runs,medianFrameP95:percentile(runs.map(r=>r.frameP95),.5),medianGpuP95:percentile(runs.map(r=>r.gpuP95),.5)};
   report.push(measured);console.log(JSON.stringify({countPerWorld:count,profile,p95:measured.medianFrameP95,gpu:measured.medianGpuP95}));
  }
 });
 const out=resolve(local,'evidence/cycle-4');await mkdir(out,{recursive:true});await writeFile(resolve(out,'capacity.json'),JSON.stringify(report,null,2)+'\n');
}finally{await server.close();await release();}
