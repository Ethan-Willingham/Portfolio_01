import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {serve,browserRun} from './browser.mjs';
import {toolLock} from './core.mjs';
const folder=resolve(process.env.CHAIN_REACTION_EVIDENCE||process.env.CHAIN_REACTION_RESEARCH+'/evidence/latest');
await mkdir(folder,{recursive:true});
const release=await toolLock(),server=await serve(),rows=[];
try{
 for(const engine of ['chromium','webkit'])await browserRun(engine,async browser=>{
  const page=await browser.newPage({viewport:{width:859,height:767},deviceScaleFactor:2,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.url+'/chain-reaction.html');await page.waitForFunction(()=>window.ChainReactionPage?.ready);
  await page.evaluate(()=>ChainReactionPage.seek(1,1));
  const home=await page.evaluate(()=>ChainReactionPage.state().camera),tick=await page.evaluate(()=>ChainReactionPage.state().tick);
  const paints=()=>page.evaluate(()=>ChainReactionPage.metrics().totalFrames);
  const first=await paints();await page.waitForTimeout(300);assert.equal(await paints(),first,'Paused canvas keeps repainting');
  await page.locator('#machine').focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);
  assert.equal((await page.evaluate(()=>ChainReactionPage.state())).camera.x,home.x+1);assert(await paints()>first,'Paused pan did not paint');
  const panned=await paints();await page.waitForTimeout(150);assert.equal(await paints(),panned,'Paused pan keeps repainting');
  await page.locator('#follow').click();await page.waitForTimeout(100);
  assert.deepEqual((await page.evaluate(()=>ChainReactionPage.state())).camera,home,'Paused follow did not restore framing');
  await page.locator('#machine').hover();await page.mouse.wheel(0,160);await page.waitForTimeout(150);
  assert((await page.evaluate(()=>ChainReactionPage.state())).camera.width>home.width,'Paused zoom absent');
  assert.equal((await page.evaluate(()=>ChainReactionPage.state())).tick,tick,'Camera gesture stepped physics');
  await page.locator('#follow').click();await page.locator('#pause').click();await page.waitForTimeout(150);
  assert((await page.evaluate(()=>ChainReactionPage.state())).tick>tick,'Play did not resume');
  // Fake only the read-only visibility signal in this disposable context.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const hiddenTick=await page.evaluate(()=>ChainReactionPage.state().tick),hiddenPaints=await paints();
  await page.waitForTimeout(300);assert.equal(await paints(),hiddenPaints);assert.equal((await page.evaluate(()=>ChainReactionPage.state())).tick,hiddenTick);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(100);assert((await page.evaluate(()=>ChainReactionPage.state())).tick>hiddenTick);
  await page.evaluate(()=>ChainReactionPage.pause());await page.waitForTimeout(100);const stopped=await paints();
  await page.waitForTimeout(150);assert.equal(await paints(),stopped,'Pause did not settle to one repaint');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  assert((await page.evaluate(()=>ChainReactionPage.state())).paused,'Visibility resumed a manual pause');
  await page.evaluate(async()=>{await ChainReactionPage.seek(3,7.67);ChainReactionPage.advance(8);});
  assert((await page.evaluate(()=>ChainReactionPage.state())).ended);await page.locator('#machine').focus();await page.keyboard.press('ArrowLeft');await page.locator('#follow').click();
  assert.equal((await page.evaluate(()=>ChainReactionPage.state())).camera.x,48,'Ended follow returned to stage start');
  assert.deepEqual(errors,[]);
  rows.push({engine,pass:true,checks:['paused canvas settles','paused pan and wheel repaint','follow restores paused framing','camera gestures never step physics','play resumes','hidden canvas and physics idle','visibility preserves manual pause','ended follow tracks final marble','zero browser errors']});
  await page.close();
 });
 await writeFile(resolve(folder,'idle.json'),JSON.stringify(rows,null,2)+'\n');console.log(JSON.stringify(rows,null,2));
}finally{await server.close();await release();}
