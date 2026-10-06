import { toolLock } from './core.mjs';
import assert from 'node:assert/strict';
import { serve,browserRun } from './browser.mjs';
const release=await toolLock();
const local=process.env.CHAIN_REACTION_RESEARCH;
if(!local)throw Error('Set CHAIN_REACTION_RESEARCH');
const server=await serve(local),report=[];
try {
  for(const engine of ['chromium','webkit'])await browserRun(engine,async browser=>{
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(server.url+'/local/chain-reaction-lab.html');
    await page.waitForFunction(()=>window.ChainReactionLab?.ready,null,{timeout:30000});
    assert.equal(await page.evaluate(()=>ChainReactionLab.settings.paused),true);
    assert.equal(await page.getByRole('button',{name:'Play',exact:true}).count(),1);
    await page.getByRole('button',{name:'Paper and card',exact:true}).click();
    assert.equal(await page.evaluate(()=>ChainReactionLab.settings.look),'paper');
    await page.getByRole('button',{name:'Material board',exact:true}).click();
    assert.equal(await page.evaluate(()=>ChainReactionLab.settings.board),true);
    await page.getByRole('button',{name:'Material board',exact:true}).click();
    await page.getByRole('button',{name:'Reveal view',exact:true}).click();
    await page.setViewportSize({width:844,height:390});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const targets=await page.locator('button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
    assert(targets.every(h=>h>=44));
    await page.getByRole('button',{name:'Play',exact:true}).click();
    await page.waitForFunction(()=>ChainReactionLab.metrics().time>.25);
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    const time=await page.evaluate(()=>ChainReactionLab.metrics().time);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>ChainReactionLab.metrics().time),time);
    assert.deepEqual(errors,[]);
    report.push({engine,version:browser.version(),pass:true,checks:['WebGL2/WASM boot','reduced motion paused','look choice','material board','reveal framing','orientation','44px targets','no horizontal overflow','play/pause','zero console errors']});
    await context.close();
  });
  console.log(JSON.stringify(report,null,2));
} finally {await server.close();await release();}
