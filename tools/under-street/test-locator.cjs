const assert=require('node:assert/strict');
const {harness,settle}=require('./test-support.cjs');
const endpoint='**/AddressPointsMetro/GeocodeServer/findAddressCandidates?*';
const civic={address:'15 Kellogg Blvd W, Saint Paul, MN',score:100,location:{x:-93.09369,y:44.94495}};
const second={address:'Saint Paul civic address, alternate match',score:98,location:{x:-93.094,y:44.945}};
const outside={address:'West Saint Paul',score:100,location:{x:-93.085,y:44.902}};
const weak={address:'Weak Saint Paul match',score:80,location:{x:-93.12,y:44.95}};
const remote={address:'Minneapolis',score:100,location:{x:-93.27,y:44.98}};
const fixture={spatialReference:{wkid:4326},candidates:[civic,second,civic,outside,weak,remote]};
(async()=>{const h=await harness();try{
 for(const size of [{width:1512,height:820},{width:1280,height:720},{width:820,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
  let mode='matches',queries=[];
  const {page,context}=await h.page(size,'#undermap',p=>p.route(endpoint,async r=>{
   queries.push(new URL(r.request().url()).searchParams.get('SingleLine'));
   if(mode==='failure')return r.fulfill({contentType:'application/json',body:JSON.stringify({error:{code:503}})});
   if(mode==='stale'){await new Promise(resolve=>setTimeout(resolve,650));return r.fulfill({contentType:'application/json',body:JSON.stringify({spatialReference:{wkid:4326},candidates:[{...civic,address:'Stale query'}]})}).catch(()=>{});}
   return r.fulfill({contentType:'application/json',body:JSON.stringify(mode==='empty'?{spatialReference:{wkid:4326},candidates:[outside,weak,remote]}:fixture)});
  }));await settle(page);
  const records=await page.locator('.um-result').evaluateAll(bs=>bs.map(b=>b.dataset.id));
  await page.locator('#um-address').fill('15 Kellogg Blvd W');assert.equal(queries.length,0);
  await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelectorAll('.um-address-matches button').length===2);
  assert.equal(queries[0],'15 Kellogg Blvd W, Saint Paul, MN');
  assert.deepEqual(await page.locator('.um-result').evaluateAll(bs=>bs.map(b=>b.dataset.id)),records);
  assert.equal((await page.evaluate(()=>__mapAudit.state())).selected,null);
  await page.locator('.um-address-matches button').first().click();await settle(page);
  const v=(await page.evaluate(()=>__mapAudit.state())).view;
  assert.ok(Math.abs(v.lon-civic.location.x)<1e-8&&Math.abs(v.lat-civic.location.y)<1e-8);assert.equal(v.z,15.5);
  assert.equal(await page.evaluate(()=>document.activeElement.tagName),'CANVAS');
  assert.equal(await page.locator('[data-um-scope="view"]').getAttribute('aria-pressed'),'true');
  assert.ok((await page.evaluate(()=>__mapAudit.results())).every(r=>r.visible));
  mode='empty';await page.locator('#um-address').fill('Outside city address');await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelector('.um-address-output [role="status"]').textContent.includes('No matching Saint Paul'));
  assert.equal(await page.locator('.um-address-matches button').count(),0);
  mode='failure';await page.locator('#um-address').fill('15 Kellogg Blvd W, Saint Paul, MN');await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelector('.um-address-output [role="status"]').textContent.includes('could not load'));assert.equal(await page.locator('.um-address-row button').isDisabled(),false);
  mode='matches';await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelectorAll('.um-address-matches button').length===2);
  mode='stale';await page.locator('#um-address').fill('Old civic address');await page.locator('.um-address-row button').click();await page.waitForTimeout(100);
  await page.locator('#um-address').fill('New civic address');mode='matches';await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelectorAll('.um-address-matches button').length===2);await page.waitForTimeout(750);
  assert.doesNotMatch(await page.locator('.um-address-matches').textContent(),/Stale/);
  assert.equal(await page.locator('#um-city').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(await page.locator('.um-location-controls :is(input,button)').evaluateAll(ns=>ns.filter(n=>{let r=n.getBoundingClientRect();return r.width<43.5||r.height<43.5;}).map(n=>n.outerHTML)),[]);
  await context.close();
 }
 const live=await h.page({width:1280,height:720});await live.page.locator('#um-address').fill('15 Kellogg Blvd W, Saint Paul, MN');await live.page.locator('.um-address-row button').click();
 await live.page.waitForFunction(()=>document.querySelectorAll('.um-address-matches button').length>0,null,{timeout:15000});await live.page.locator('.um-address-matches button').first().click();
 assert.ok(Math.abs((await live.page.evaluate(()=>__mapAudit.state())).view.lon+93.093687)<.001);await live.context.close();
 assert.deepEqual(h.errors,[]);assert.deepEqual(h.failures,[]);console.log('PASS six-size Saint Paul address search, exact municipal boundary and score filters, explicit choice, duplicate filtering, retry, canceled queries, local address suffix and live CORS query');
}finally{await h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
