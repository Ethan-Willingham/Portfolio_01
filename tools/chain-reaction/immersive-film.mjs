import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT, hash, toolLock} from './core.mjs';
import {serve, browserRun} from './browser.mjs';

const unlock = await toolLock();
let server;
const rows = [], output = process.env.CHAIN_REACTION_OUTPUT || '/tmp/chain-reaction-immersive';
const paths=['chain-reaction.html','chain-reaction/connected-renderer.js','chain-reaction/connected-slice.js','chain-reaction/world-dressing.js','chain-reaction/stages/viewer/index.json',...['00001','00002','00003','00004'].map(n=>'chain-reaction/stages/viewer/'+n+'.json')];
const sources=await Promise.all(paths.map(async path=>({path,hash:hash(await readFile(resolve(ROOT,path)))})));
try {
  await mkdir(output, {recursive: true});
  server = await serve();
  await browserRun('chromium', async browser => {
    for (const profile of [{name:'owner',width:859,height:767,cpu:1},{name:'landscape-phone-proxy',width:844,height:390,cpu:4}]) {
      const page = await browser.newPage({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:2});
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:profile.cpu});
      await page.goto(server.url + '/chain-reaction.html?paused=1#stage=4');
      await page.waitForFunction(() => window.ChainReactionPage?.ready);
      for (const mode of ['busy-catch','busy-drawer','overview']) {
        const runs = [];
        for (let n=0;n<5;n++) {
          await page.evaluate(async mode => {await ChainReactionPage.seek(mode==='busy-catch'?2:4,0);if(mode==='overview')ChainReactionPage.overview();ChainReactionPage.resetMetrics();ChainReactionPage.play();},mode);
          if (mode==='busy-catch') await page.waitForFunction(() => ChainReactionPage.state().stage===3,{}, {timeout:15000});
          else if (mode==='busy-drawer') await page.waitForFunction(() => ChainReactionPage.state().ended,{}, {timeout:20000});
          else await page.waitForFunction(() => ChainReactionPage.metrics().frames.length >= 360,{}, {timeout:15000});
          await page.evaluate(() => ChainReactionPage.pause());
          const metrics = await page.evaluate(() => ChainReactionPage.metrics()), sorted = [...metrics.frames].sort((a,b)=>a-b);
          assert.ok(sorted.length>200);
          runs.push({frames:sorted.length,p95:sorted[Math.floor((sorted.length-1)*.95)],maximum:sorted.at(-1)});
        }
        const medianP95 = runs.map(r=>r.p95).sort((a,b)=>a-b)[2];
        const row={profile,mode,runs,medianP95,budget:16.7,pass:medianP95<=16.7};
        rows.push(row);
        console.log(profile.name+' '+mode+' five-run median p95 '+medianP95.toFixed(2)+' ms '+(row.pass?'PASS':'FAIL'));
      }
      await cdp.detach();await page.close();
    }
  });
  for(const source of sources)assert.equal(hash(await readFile(resolve(ROOT,source.path))),source.hash,'Performance input changed during measurement: '+source.path);
  await writeFile(resolve(output,'film.json'),JSON.stringify({scope:'Five actual DPR2 catch playback, drawer playback and animated overview runs per Chromium owner and CPU4 landscape-phone proxy. No physical phone measurement.',pass:rows.every(r=>r.pass),sources,rows},null,2)+'\n');
  assert.ok(rows.every(r=>r.pass),'Immersive scene exceeds the established 16.7 ms frame budget.');
} catch(error) {
  await mkdir(output,{recursive:true});await writeFile(resolve(output,'film-failed.json'),JSON.stringify({error:String(error),sources,rows},null,2)+'\n');throw error;
} finally {await server?.close();await unlock();}
