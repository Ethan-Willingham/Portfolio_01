const assert=require('node:assert/strict');
const {harness,settle}=require('./test-support.cjs');
(async()=>{const h=await harness();try{
 const {page,context}=await h.page();await settle(page);
 const registry=await page.evaluate(()=>__mapAudit.layerInfo());assert.equal(Object.keys(registry).length,46);
 for(const [id,cfg] of Object.entries(registry)){
  await page.locator('[data-um-topic="'+cfg.topic+'"]').click();await page.locator('.um-layers').evaluate(d=>d.open=true);
  for(const other of await page.locator('.um-layer[aria-pressed="true"]').evaluateAll(bs=>bs.map(b=>b.dataset.layer)))if(other!==id)await page.locator('[data-layer="'+other+'"]').click();
  const button=page.locator('[data-layer="'+id+'"]');if(await button.getAttribute('aria-pressed')!=='true')await button.click();
  await page.evaluate(z=>__mapAudit.move(-93.12,44.95,z),Math.max(14,cfg.minZ+.5));await settle(page);
  const state=(await page.evaluate(()=>__mapAudit.state())).data[id];assert.ok(state&&!state.error&&state.count>0,id+' loads');
  if(cfg.kind==='raster'){assert.ok(await page.evaluate(()=>__mapAudit.hit(__mapAudit.state().W/2,__mapAudit.state().H/2)));continue;}
  const f=await page.evaluate(id=>__mapAudit.sample(id),id);assert.ok(f,id+' has a visible-lifecycle record');
  assert.ok(await page.evaluate(f=>UnderStreetData.contains(f.lon,f.lat),f),id+' anchor is inside Saint Paul');
  assert.ok(Array.isArray(f.facts)&&f.facts.length,id+' facts');assert.match(f.reference.wiki,/^https:\/\/en.wikipedia.org\/wiki\//);
  await page.evaluate(({id,feature})=>{const index=__mapAudit.layer(id).findIndex(f=>f.id===feature);__mapAudit.select(id,index);},{id,feature:f.id});
  assert.equal(await page.locator('.um-ptitle').textContent(),f.name);
  assert.ok(await page.locator('.um-links a[href*="wikipedia.org/wiki/"]').count());
  assert.ok(await page.locator('.um-links a').filter({hasText:'Dataset source'}).count(),id+' source');
  await page.locator('.um-pback').click();
 }
 await page.locator('[data-um-topic="networks"]').click();await page.locator('.um-layers').evaluate(d=>d.open=true);
 if(await page.locator('[data-layer="signalLines"]').getAttribute('aria-pressed')!=='true')await page.locator('[data-layer="signalLines"]').click();await settle(page);
 await page.locator('.um-search input').fill('abandoned');await page.waitForFunction(()=>document.querySelectorAll('.um-result').length===0);
 await page.locator('[data-um-inactive]').click();await page.waitForFunction(()=>document.querySelectorAll('.um-result').length===2);
 await page.locator('.um-result').first().click();assert.match(await page.locator('.um-facts').textContent(),/ABANDONED/);
 await page.locator('.um-data').evaluate(d=>d.open=true);await page.locator('[data-um-source-scope="all"]').click();
 for(const id of ['trout-brook','rwmwd-pipes','rwmwd-structures','rwmwd-ponds','saint-paul-hydrants','saint-paul-signals']){
  await page.locator('.um-source-search input').fill(id);await page.waitForFunction(()=>document.querySelectorAll('.um-source-item').length===1);
  assert.ok(await page.locator('.um-source-item a[download]').count());assert.match(await page.locator('.um-source-item').textContent(),/Saint Paul/);
 }
 await context.close();assert.deepEqual(h.errors,[]);assert.deepEqual(h.failures,[]);console.log('PASS all 46 layers, city anchors, precise Wikipedia types, source and record panels, inactive signal records and six new downloads');
}finally{await h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
