const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {harness,settle}=require('./test-support.cjs');
const output=process.env.UNDER_MAP_TEST_OUTPUT||'/tmp/saint-paul-qa';fs.mkdirSync(output,{recursive:true});
(async()=>{const h=await harness();try{
 const {page,context}=await h.page();await settle(page);
 assert.equal(await page.title(),"What's Under a Saint Paul Street");
 assert.equal((await page.evaluate(()=>__mapAudit.state())).topic,'lines');
 assert.equal(await page.locator('.um-topics button').count(),8);
 assert.equal(await page.locator('#um-city,[data-um-topic="tour"],.rail,.top-nav').count(),0);
 assert.doesNotMatch(await page.locator('body').textContent(),/Twin Cities|Minneapolis|Bloomington|Eagan|Maplewood|West Saint Paul|Bassett|Field guide|Start here/i);
 for(const topic of ['water','wastewater','storm','power','gas','networks','ground']){
  await page.locator('[data-um-topic="'+topic+'"]').click();await settle(page);
  assert.equal((await page.evaluate(()=>__mapAudit.state())).topic,topic);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#undermap').screenshot({path:path.join(output,topic+'.png')});
 }
 await page.locator('[data-um-topic="storm"]').click();await settle(page);
 const state=await page.evaluate(()=>__mapAudit.state());assert.equal(state.data.troutBrook.loaded,6);assert.equal(state.data.rwmwdPipes.loaded,60);
 const selected=await page.evaluate(()=>__mapAudit.select('rwmwdPipes'));
 assert.match(await page.locator('.um-ptitle').textContent(),/segment/);assert.ok(await page.locator('.um-links a[href*="Infrastructure_DistOwned"]').count());
 assert.match(await page.locator('.um-facts').textContent(),/unspecified/);
 const hash=await page.evaluate(()=>location.hash),restored=await h.page({width:1280,height:720},hash);await restored.page.waitForFunction(id=>__mapAudit.state().selected===id,selected);await restored.context.close();
 await page.locator('.um-pback').click();await page.locator('[data-id="trout-brook"]').click();
 assert.match(await page.locator('.um-ptitle').textContent(),/Trout Brook/);assert.ok(await page.locator('.um-links a[href*="wikipedia.org/wiki/Trout_Brook"]').count());
 await page.locator('.um-pback').click();await page.locator('[data-um-topic="water"]').click();await page.evaluate(()=>__mapAudit.move(-93.12,44.95,15));await settle(page);
 assert.equal((await page.evaluate(()=>__mapAudit.state())).data.hydrants.loaded,6441);await page.evaluate(()=>__mapAudit.select('hydrants'));assert.match(await page.locator('.um-facts').textContent(),/December 2021/);
 await page.locator('[data-um-topic="networks"]').click();await settle(page);await page.evaluate(()=>__mapAudit.select('signalLines'));assert.match(await page.locator('.um-pblurb').textContent(),/signal|Signal/);assert.match(await page.locator('.um-facts').textContent(),/Traffic signals/);
 await page.locator('[data-um-topic="ground"]').click();await settle(page);await page.evaluate(()=>__mapAudit.move(-93.12,44.95,13));await settle(page);
 assert.match((await page.evaluate(()=>__mapAudit.hit(__mapAudit.state().W/2,__mapAudit.state().H/2)))?.name||'',/ft to bedrock|Well/);
 assert.equal(await page.evaluate(()=>{let p=__mapAudit.point(-93.26,44.975);return __mapAudit.hit(...p);}),null,'No inspection outside Saint Paul');
 console.log('Draw ms:',await page.evaluate(()=>__mapAudit.performance()));
 await context.close();
 for(const size of [{width:1512,height:820},{width:1440,height:760},{width:1280,height:720},{width:1024,height:768},{width:820,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
  const {page,context}=await h.page(size);await settle(page);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(size.width>=761&&size.height>=600){const r=await page.locator('.um-shell').boundingBox();assert.ok(r.y>=-2&&r.y+r.height<=size.height+2,'Normal browser viewport fits '+JSON.stringify(size));assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);}
  assert.deepEqual(await page.locator('#undermap button:visible').evaluateAll(bs=>bs.filter(b=>{let r=b.getBoundingClientRect();return r.width<43.5||r.height<43.5;}).map(b=>b.textContent)),[]);
  await page.locator('[data-um-topic="water"]').click();await settle(page);assert.equal(await page.locator('.um-result').filter({hasText:'Highland Park Water Tower'}).count(),1);
  await page.locator('[data-id="highland"]').click();await page.waitForFunction(()=>document.querySelector('.um-pimg img')?.naturalWidth>0);
  await page.locator('#undermap').screenshot({path:path.join(output,'highland-'+size.width+'.png')});
  await page.locator('.um-photo-open').click();assert.equal(await page.locator('.um-photo-dialog').evaluate(d=>d.open),true);await page.locator('[data-photo-close]').click();assert.equal(await page.locator('.um-photo-open').evaluate(b=>b===document.activeElement),true);
  await page.locator('.um-data').evaluate(d=>d.open=true);await page.locator('[data-um-source-scope="all"]').click();assert.equal(await page.locator('.um-source-item').count(),50);
  await page.locator('.um-source-search input').fill('Saint Paul street centerlines');await page.waitForFunction(()=>document.querySelectorAll('.um-source-item').length===1);assert.ok(await page.locator('.um-source-item a[download]').count());
  await context.close();
 }
 const old=await h.page({width:1280,height:720},'#map=10/44.82/-93.3&topic=water&layers=bloomWater,eaganWater');await settle(old.page);assert.equal(await old.page.locator('[data-id="highland"]').count(),1);assert.ok((await old.page.evaluate(()=>__mapAudit.state())).view.lon>-93.22);await old.context.close();
 assert.deepEqual(h.errors,[]);assert.deepEqual(h.failures,[]);console.log('PASS Saint Paul topics, real routes, source fields, deep links, city boundary, photographs, laptop fit, responsive controls and downloads');
}finally{await h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
