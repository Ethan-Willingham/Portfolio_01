import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT,toolLock} from './core.mjs';
import {serve,browserRun} from './browser.mjs';
const evidence=process.env.CHAIN_REACTION_EVIDENCE||process.env.CHAIN_REACTION_RESEARCH+'/evidence/latest';
const release=await toolLock(),require=createRequire(import.meta.url),sharp=require(process.env.CHAIN_REACTION_SHARP);
const folder=resolve(ROOT,'assets/chain-reaction/stills');let server;
try {
 await mkdir(evidence,{recursive:true});await mkdir(folder,{recursive:true});server=await serve();
 await browserRun('chromium',async browser=>{
  for(const [name,width,height] of [['desktop',1440,900],['landscape',844,390],['portrait',390,844]]) {
   const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2});
   try {
    const page=await context.newPage();await page.goto(server.url+'/chain-reaction.html?paused=1');
    await page.waitForFunction(()=>window.ChainReactionPage?.ready);
    await page.evaluate(()=>document.fonts.ready);
    await page.addStyleTag({content:'.cr-home,.cr-title,.cr-controls,.cr-status,.cr-frontier{display:none!important}'});
    const bytes=await page.locator('#machine').screenshot();await sharp(bytes).webp({quality:92}).toFile(resolve(folder,name+'.webp'));
   } finally {await context.close();}
  }
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  try {
   await page.goto(server.url+'/chain-reaction.html?paused=1#stage=1');await page.waitForFunction(()=>window.ChainReactionPage?.ready);
   for(const [stage,time] of [[1,0],[1,8.6],[2,3.6],[3,1.12],[4,2]]) {
    await page.evaluate(([s,t])=>ChainReactionPage.seek(s,t),[stage,time]);
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:evidence+'/review-'+stage+'-'+time+'.png'});
   }
   await page.evaluate(()=>ChainReactionPage.overview());
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.screenshot({path:evidence+'/review-overview.png'});
  } finally {await page.close();}
 });
 console.log('Three first-visit fallback stills, five stage views and an overview saved');
} finally {await server?.close();await release();}
