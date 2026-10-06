import { toolLock } from './core.mjs';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { serve, browserRun } from './browser.mjs';
const release=await toolLock();
const local=process.env.CHAIN_REACTION_RESEARCH;
if(!local)throw Error('Set CHAIN_REACTION_RESEARCH to the private research folder');
const output=resolve(local,'evidence');await mkdir(output,{recursive:true});
const server=await serve(local),report=[];
try {
  await browserRun('chromium',async browser=>{
    for(const viewport of [{width:1440,height:900},{width:844,height:390},{width:390,height:844}]) {
      const page=await browser.newPage({viewport}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
      await page.goto(server.url+'/local/chain-reaction-lab.html');
      await page.waitForFunction(()=>window.ChainReactionLab?.ready,{timeout:30000});
      await page.evaluate(()=>{ChainReactionLab.settings.paused=true;});
      for(const direction of ['tabletop','paper','tin']) {
        await page.evaluate(look=>ChainReactionLab.direction(look),direction);
        for(const time of [0,.3,81/240,82/240,.5,1,1.5,3]) {
          await page.evaluate(t=>ChainReactionLab.seek(t),time);
          await page.locator('canvas').screenshot({path:resolve(output,`${direction}-${viewport.width}-${time}.png`)});
        }
      }
      await page.evaluate(()=>{ChainReactionLab.board(true);});
      await page.locator('canvas').screenshot({path:resolve(output,`materials-${viewport.width}.png`)});
      report.push({viewport,errors,metrics:await page.evaluate(()=>ChainReactionLab.metrics()),causality:await page.evaluate(()=>ChainReactionLab.causality())});
      if(errors.length)throw Error(errors.join('\n'));
      await page.close();
    }
  });
  console.log(JSON.stringify(report,null,2));
  await writeFile(resolve(output,'capture.json'),JSON.stringify(report,null,2)+'\n');
} finally {await server.close();await release();}
