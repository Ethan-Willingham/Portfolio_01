import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT,toolLock} from './core.mjs';
import {serve,browserRun} from './browser.mjs';
const folder=resolve(process.env.CHAIN_REACTION_EVIDENCE||process.env.CHAIN_REACTION_RESEARCH+'/evidence/latest');
await mkdir(folder,{recursive:true});
const release=await toolLock(),server=await serve(),rows=[];
const first=JSON.parse(await readFile(resolve(ROOT,'assets/chain-reaction/stages/00001.json')));
const contact=first.verified.steps.filter(s=>s.kind==='contact').reduce((n,s)=>Math.min(n,s.contactTick),Infinity);
try{
 for(const engine of ['chromium','webkit'])await browserRun(engine,async browser=>{
  const context=await browser.newContext({viewport:{width:844,height:390}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.url+'/chain-reaction.html');
  await page.waitForFunction(()=>window.ChainReactionPage?.ready);
  await page.waitForFunction(()=>ChainReactionPage.state().stage===1&&ChainReactionPage.state().tick>=720,null,{timeout:15000});
  const reveal=await page.evaluate(()=>ChainReactionPage.state());
  assert(reveal.camera.width>50,'First visit reveal absent');assert(reveal.tick<contact,'Reveal hides the first transfer');
  await page.screenshot({path:resolve(folder,engine+'-first-reveal.png')});
  await page.waitForFunction(()=>ChainReactionPage.state().stage===1&&ChainReactionPage.state().tick>=1610);
  const returned=await page.evaluate(()=>ChainReactionPage.state());
  assert(returned.camera.width<12,'Reveal failed to return');assert(returned.tick<contact,'Camera returned after the first contact');
  await page.screenshot({path:resolve(folder,engine+'-returned.png')});
  await page.waitForFunction(()=>ChainReactionPage.state().stage===2&&ChainReactionPage.state().tick>=300);
  const cup=await page.evaluate(()=>ChainReactionPage.state());
  assert(cup.camera.width<12,'Cup setup hidden by an overview');
  await page.waitForFunction(()=>ChainReactionPage.state().ended,null,{timeout:20000});
  assert.deepEqual(errors,[]);
  await page.reload();await page.waitForFunction(()=>window.ChainReactionPage?.ready);
  assert.equal((await page.evaluate(()=>ChainReactionPage.state())).stage,3);
  rows.push({engine,pass:true,firstContactTime:contact/240,reveal:{width:reveal.camera.width,time:reveal.tick/240},returned:{width:returned.camera.width,time:returned.tick/240},cup:{width:cup.camera.width,time:cup.tick/240},checks:['first visit pullback during slow arm fall','return before first contact','close cup setup','continuous chain','resume saved stage','zero browser errors']});
  await context.close();
 });
 console.log(JSON.stringify(rows,null,2));await writeFile(resolve(folder,'opening.json'),JSON.stringify(rows,null,2)+'\n');
}finally{await server.close();await release();}
