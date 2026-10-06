const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness,settle}=require('./test-support.cjs');
const output=process.env.UNDER_MAP_TEST_OUTPUT||'/tmp/saint-paul-qa';fs.mkdirSync(output,{recursive:true});
const sources=['interceptors','troutBrook','rwmwdPipes','buried','pipelines','power','feeders','signalLines'];
(async()=>{const h=await harness();try{
 const {page,context}=await h.page();await settle(page);
 assert.equal((await page.evaluate(()=>__mapAudit.state())).topic,'lines');
 assert.deepEqual((await page.evaluate(()=>__mapAudit.active())).sort(),sources.sort());
 const initial=await page.evaluate(()=>({state:__mapAudit.state(),results:__mapAudit.results(),layers:__mapAudit.layerInfo()}));
 assert.equal(initial.results.length,2806);assert.ok(initial.results.every(f=>f.kind==='line'));
 assert.ok(sources.every(id=>initial.state.data[id].loaded>0&&initial.layers[id].kind==='line'));
 assert.equal(initial.state.sat.on,false);assert.ok(!initial.state.data.hydrants&&!initial.state.data.plants&&!initial.state.data.towers);
 assert.deepEqual(await page.locator('.um-line-total').allTextContents(),['0','1,203','76','32','88','1,407']);
 assert.ok(initial.results.some(f=>f.type==='signalradio'));assert.ok(initial.results.some(f=>f.type==='emptyconduit'));
 assert.equal(await page.locator('.um-basemap [data-um-base="sat"]:visible,.um-result-thumb,.um-inactive:visible').count(),0);
 await page.locator('.um-layers').evaluate(d=>d.open=true);
 assert.equal(await page.locator('.um-layer-list button').count(),8);await page.locator('[data-layer="rwmwdPipes"]').click();assert.equal(await page.locator('[data-line-group="storm"]').getAttribute('aria-pressed'),'mixed');await page.locator('[data-layer="rwmwdPipes"]').click();
 assert.match(await page.locator('.um-line-gaps').textContent(),/Water mains|Local sanitary mains|gas-distribution|buried-cable|telecom routes/);
 await page.locator('[data-layer="interceptors"]').click();assert.equal((await page.evaluate(()=>__mapAudit.results())).length,1603);
 await page.locator('.um-layers').evaluate(d=>d.open=false);
 await page.locator('[data-line-group="sewer"]').click();assert.equal((await page.evaluate(()=>__mapAudit.results())).length,2806);
 await page.locator('[data-line-group="cables"]').click();assert.equal((await page.evaluate(()=>__mapAudit.results())).length,1399);
 assert.match(await page.evaluate(()=>location.hash),/topic=lines/);assert.doesNotMatch(await page.evaluate(()=>location.hash),/signalLines/);
 await page.locator('[data-lines-all]').click();assert.equal((await page.evaluate(()=>__mapAudit.results())).length,2806);
 // Individual systems and combined lines retain separate visibility choices.
 await page.locator('[data-um-topic="wastewater"]').click();await settle(page);await page.locator('.um-layers').evaluate(d=>d.open=true);await page.locator('[data-layer="interceptors"]').click();await page.locator('.um-layers').evaluate(d=>d.open=false);
 await page.locator('[data-um-topic="lines"]').click();assert.equal((await page.evaluate(()=>__mapAudit.results())).length,2806);
 const former=await page.evaluate(()=>__mapAudit.layer('interceptors').findIndex(f=>f.p.s&&f.p.s!=='Online'));
 assert.ok(former>=0);const selected=await page.evaluate(i=>__mapAudit.select('interceptors',i),former);
 assert.equal(await page.locator('.um-pimg,[data-pa="aerial"]:visible').count(),0);assert.equal(await page.locator('[data-pa="closer"]').textContent(),'Zoom to line');
 const hash=await page.evaluate(()=>location.hash),restored=await h.page({width:1280,height:720},hash);await restored.page.waitForFunction(id=>__mapAudit.state().selected===id,selected);assert.equal((await restored.page.evaluate(()=>__mapAudit.state())).topic,'lines');await restored.context.close();
 await page.locator('.um-pback').click();
 // The city overview and a close neighborhood both inspect line records only.
 for(const z of [12,15.5]){await page.evaluate(z=>__mapAudit.move(-93.1,44.95,z),z);await settle(page);assert.ok((await page.evaluate(()=>__mapAudit.results())).every(f=>f.kind==='line'));const hits=await page.evaluate(()=>{let s=__mapAudit.state(),hits=[];for(let x=20;x<s.W;x+=50)for(let y=20;y<s.H;y+=50){let f=__mapAudit.hit(x,y);if(f)hits.push(f.kind);}return hits;});assert.ok(hits.length);assert.ok(hits.every(k=>k==='line'));}
 await context.close();
 for(const size of [{width:1512,height:820},{width:1440,height:760},{width:1280,height:720},{width:820,height:720},{width:390,height:844},{width:320,height:568}]){
  const test=await h.page(size);await settle(test.page);
  assert.equal(await test.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(await test.page.locator('#undermap button:visible').evaluateAll(bs=>bs.filter(b=>{let r=b.getBoundingClientRect();return r.width<43.5||r.height<43.5;}).map(b=>b.textContent)),[]);
  if(size.width>=761){const geometry=await test.page.evaluate(()=>{let s=document.querySelector('.um-shell'),m=document.querySelector('.um-stage'),r=s.getBoundingClientRect();return {top:r.top,bottom:r.bottom,overflow:s.scrollHeight-s.clientHeight,mapHeight:m.clientHeight,full:!!document.fullscreenElement};});assert.ok(geometry.top>=-2&&geometry.bottom<=size.height+2);assert.ok(geometry.overflow<2,'Entire collapsed explorer fits '+JSON.stringify(size)+': '+JSON.stringify(geometry));assert.ok(geometry.mapHeight>=239);assert.equal(geometry.full,false);}
  await test.page.locator('#undermap').screenshot({path:path.join(output,'all-lines-'+size.width+'.png')});await test.context.close();
 }
 // An intentionally empty line list stays empty after reload and can be restored.
 const blank=await h.page();await blank.page.goto(h.url+'/archive/under-the-street/under-the-street.html#map=12/44.95/-93.1&topic=lines&layers=');await blank.page.reload();await blank.page.waitForFunction(()=>window.__mapAudit);await settle(blank.page);assert.equal((await blank.page.evaluate(()=>__mapAudit.active())).length,0);assert.equal((await blank.page.evaluate(()=>__mapAudit.results())).length,0);await blank.page.locator('[data-lines-all]').click();await settle(blank.page);assert.equal((await blank.page.evaluate(()=>__mapAudit.results())).length,2806);await blank.context.close();
 assert.deepEqual(h.errors,[]);assert.deepEqual(h.failures,[]);console.log('PASS 2,806 line records, eight line-only sources, six coverage totals, former/radio/empty distinctions, independent toggles, deep links, line-only hits and normal laptop fit');
}finally{await h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
