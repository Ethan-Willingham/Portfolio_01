const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {harness,settle,root}=require('./test-support.cjs');
const index=JSON.parse(fs.readFileSync(path.join(root,'archive/under-the-street/assets/map/data/context-streets-tiles.json')));
function clean(c){assert.equal(c.duplicates,0);assert.equal(c.missing,0);assert.equal(c.stale,0);assert.ok(c.count>0);}
async function move(page,lon,lat,z=16){await page.evaluate(([lon,lat,z])=>__mapAudit.move(lon,lat,z),[lon,lat,z]);await page.waitForTimeout(220);await settle(page);}
(async()=>{const h=await harness();try{
 const {page,context}=await h.page();const requests=[];page.on('request',r=>requests.push(r.url()));await settle(page);
 const labels=await page.evaluate(()=>__mapAudit.labels());assert.ok(labels.includes('Saint Paul'));assert.ok(!labels.includes('Minneapolis'));
 await move(page,-93.12,44.95,13.1);assert.equal(requests.some(u=>u.includes('context-streets')),false);
 for(const t of index.tiles){const b=t.bounds;await move(page,(b[0]+b[2])/2,(b[1]+b[3])/2);clean(await page.evaluate(()=>__mapAudit.cache('contextStreets')));}
 await move(page,-93.12,44.95,12);assert.equal((await page.evaluate(()=>__mapAudit.state())).data.contextStreets.parts,24);
 const before=requests.filter(u=>u.includes('context-streets-tiles/')).length;
 const b=index.tiles[0].bounds;await move(page,(b[0]+b[2])/2,(b[1]+b[3])/2);assert.ok(requests.filter(u=>u.includes('context-streets-tiles/')).length>before);
 await move(page,-93.12,44.95,15.5);const streetNames=await page.evaluate(()=>__mapAudit.streetNames());assert.ok((await page.evaluate(()=>__mapAudit.labels())).some(t=>streetNames.includes(t)));clean(await page.evaluate(()=>__mapAudit.cache('contextStreets')));await context.close();
 for(const pattern of ['**/context-streets-tiles.json*','**/context-streets-tiles/*.json*']){
  const test=await h.page();await settle(test.page);await test.page.route(pattern,r=>r.fulfill({status:503,body:'unavailable'}));await move(test.page,-93.12,44.95,15);
  assert.match(await test.page.locator('.um-status').textContent(),/Street context could not load/);
  await test.page.unroute(pattern);await test.page.locator('[data-um-base="map"]').click();await test.page.waitForTimeout(220);await settle(test.page);
  assert.ok((await test.page.evaluate(()=>__mapAudit.state())).data.contextStreets.loaded>0);assert.doesNotMatch(await test.page.locator('.um-status').textContent(),/Street context could not load/);clean(await test.page.evaluate(()=>__mapAudit.cache('contextStreets')));await test.context.close();
 }
 assert.deepEqual(h.errors,[]);assert.ok(h.failures.every(u=>u.includes('context-streets-tiles')));console.log('PASS city-only named street labels, lazy loading, disjoint cache, eviction/revisit and street index/tile retries');
}finally{await h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
