import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hash,toolLock} from './core.mjs';
import {serve,browserRun} from './browser.mjs';
const sharp=createRequire(import.meta.url)(process.env.CHAIN_REACTION_SHARP);
const output=process.env.CHAIN_REACTION_OUTPUT||'/tmp/chain-reaction-batching';
const unlock=await toolLock(),rows=[];let server;
try {
 await mkdir(output,{recursive:true});server=await serve();
 for(const engine of ['chromium','webkit']) await browserRun(engine,async browser=>{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
   await page.goto(server.url+'/chain-reaction.html?paused=1#stage=1');
   await page.waitForFunction(()=>window.ChainReactionPage?.ready);
   await page.addStyleTag({content:'.cr-home,.cr-title,.cr-controls,.cr-status,.cr-frontier{display:none!important}'});
   for(const [stage,time,overview] of [[1,8.6,false],[2,1.56,false],[3,1.12,false],[4,5.73,false],[4,0,true]]) {
    const captures=[],stats=[];let snapshot;
    for(const enabled of [false,true]) {
     await page.evaluate(async({stage,time,overview,enabled})=>{
      ChainReactionPage.inspect().diorama.setBatchEnabled(enabled);
      await ChainReactionPage.seek(stage,time);if(overview)ChainReactionPage.overview();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
     },{stage,time,overview,enabled});
     const s=hash(Uint8Array.from(await page.evaluate(()=>ChainReactionPage.snapshot())));
     if(snapshot)assert.equal(s,snapshot);else snapshot=s;
     const stem=`${engine}-${overview?'overview':'stage-'+stage}-${enabled?'batched':'authored'}`;
     captures.push(await page.locator('#machine').screenshot({path:resolve(output,stem+'.png')}));
     stats.push(await page.evaluate(()=>({render:ChainReactionPage.metrics(),batch:ChainReactionPage.inspect().diorama.batchStats})));
    }
    const a=await sharp(captures[0]).removeAlpha().raw().toBuffer(),b=await sharp(captures[1]).removeAlpha().raw().toBuffer();
    assert.equal(a.length,b.length);let total=0,maximum=0,changed=0;
    for(let n=0;n<a.length;n++){const d=Math.abs(a[n]-b[n]);total+=d;maximum=Math.max(maximum,d);if(d>2)changed++;}
    const delta={mean:total/a.length,maximum,changedFraction:changed/a.length};
    const row={engine,stage,time,overview,delta,snapshot,authored:stats[0],batched:stats[1],pass:delta.mean<=.1&&delta.changedFraction<=.001};rows.push(row);
    assert.ok(row.pass,'Batching changes the scene: '+JSON.stringify(delta));
   }
   assert.deepEqual(errors,[]);
  } finally {await page.close();}
 });
 await writeFile(resolve(output,'batching.json'),JSON.stringify({pass:true,scope:'Identical paused physical snapshots and canvas framing with authored and batched scenery. Pixel allowance covers floating-point transform and raster edge rounding; no material/texture or geometry reduction.',rows},null,2)+'\n');
 console.log('Both engines preserve scenery pixels and physical snapshots across static batching.');
} catch(error) {await writeFile(resolve(output,'batching-failed.json'),JSON.stringify({error:String(error),rows},null,2)+'\n');throw error;}
finally {await server?.close();await unlock();}
