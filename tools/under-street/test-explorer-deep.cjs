// Uses an owned Chrome for Testing process and closes it even on failure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, launchOptions } = require('./browser-support.cjs');
const root = path.resolve(__dirname, '../..');
const output = process.env.UNDER_MAP_TEST_OUTPUT || '/tmp/under-street-deep-qa';
fs.mkdirSync(output, { recursive: true });
const errors = [], localFailures = [], requests = [];
let browser;
const hooks = `
window.__mapAudit = {
  state:()=>({topic,view:{...view},W,H,selected:selection&&selection.id,selectedCoordinates:selection&&[lonOf(selection.x),latOf(selection.y)],sat:{on:SAT.on,failed:SAT.failed},data:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,{loading:v.loading,error:v.error,pending:v.pending,count:v.count,loaded:v.features&&v.features.length}]))}),
  layerInfo:()=>Object.fromEntries(Object.entries(layers).map(([id,c])=>[id,{kind:c.kind,minZ:c.minZ,on:c.on,bounds:c.metadata?.bounds,topic:Object.keys(topics).find(k=>topics[k].layers.includes(id))}])),
  sample:id=>{var d=data[id],fs=d&&d.features;if(!fs)return null;var f=fs.filter(allowed).sort((a,b)=>Math.hypot(a.x-view.x,a.y-view.y)-Math.hypot(b.x-view.x,b.y-view.y))[0];return f&&{id:f.id,name:f.name,lon:lonOf(f.x),lat:latOf(f.y),facts:featureFacts(f),type:typeInfo(f),count:fs.length,unique:new Set(fs.map(f=>f.id)).size};},
  point:(lon,lat)=>toPx(mx(lon),my(lat)),
  move:(lon,lat,z)=>{view.x=mx(lon);view.y=my(lat);view.z=z;noteMoved();requestDraw();},
  select:(id,index=0)=>openPanel(data[id].features[index],false),
  hit:(x,y)=>hitTest(x,y),
  source:id=>metaFor(id),
  photo:(id,index=0)=>photoFor(data[id].features[index]),
  performance:()=>{const samples=[];for(let i=0;i<12;i++){const t=performance.now();draw();samples.push(performance.now()-t);}return samples;}
};
`;
const mime = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const server = http.createServer((req,res) => {
  const file = path.resolve(root, '.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try {
    let bytes=fs.readFileSync(file);
    if(file.endsWith('/under-map.js')){const src=bytes.toString(),end=src.lastIndexOf('})();');bytes=Buffer.from(src.slice(0,end)+hooks+src.slice(end));}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(bytes);
  } catch {res.writeHead(404).end();}
});
async function pageFor(size,hash='',configure) {
  const context=await browser.newContext({viewport:size,reducedMotion:'reduce',deviceScaleFactor:size.width<600?2:1,hasTouch:size.width<600});
  await context.route('https://www.googletagmanager.com/**',r=>r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(url)){requests.push(r.url());if(r.status()>=400)localFailures.push(r.url());}});
  if(configure)await configure(page);
  await page.goto(url+'/archive/under-the-street/under-the-street.html'+hash);
  await page.locator('#undermap').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>window.__mapAudit && (document.querySelectorAll('.um-result').length>0||__mapAudit.state().topic!=='tour'));
  await page.evaluate(()=>document.fonts.ready);
  return {page,context};
}
let url;
(async()=>{try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch(launchOptions);
  const {page,context}=await pageFor({width:1440,height:1000});
  await page.waitForFunction(()=>__mapAudit.layerInfo().bloomWater.bounds);
  const catalog=await page.evaluate(()=>__mapAudit.layerInfo()),coverage=[];
  for(const [id,cfg] of Object.entries(catalog)) {
    await page.locator('[data-um-topic="'+cfg.topic+'"]').click();
    await page.locator('.um-layers').evaluate(d=>d.open=true);
    for(const other of await page.locator('.um-layer[aria-pressed="true"]').evaluateAll(bs=>bs.map(b=>b.dataset.layer)))if(other!==id)await page.locator('[data-layer="'+other+'"]').click();
    const control=page.locator('[data-layer="'+id+'"]');if(await control.getAttribute('aria-pressed')!=='true')await control.click();
    const b=cfg.bounds||[-93.4,44.8,-93.1,45.1],center=id==='services'||id==='wells'?[-93.27,44.95]:[(b[0]+b[2])/2,(b[1]+b[3])/2];
    await page.evaluate(({center,z})=>__mapAudit.move(...center,z),{center,z:Math.max(12.7,cfg.minZ+.7)});
    await page.waitForFunction(id=>{const d=__mapAudit.state().data[id];return d&&!d.loading&&!d.pending&&!d.error&&(d.loaded>0||id==='depth'&&d.count>0);},id);
    if(cfg.kind==='raster') {
      await page.evaluate(()=>__mapAudit.move(-93.2,44.95,12));await page.locator('canvas').focus();await page.keyboard.press('Enter');
      assert.match(await page.locator('.um-ptitle').textContent(),/ft to bedrock/);
      await page.locator('.um-pback').click();assert.equal(await page.evaluate(()=>document.activeElement.tagName),'CANVAS','Depth Back restores canvas keyboard focus');
      coverage.push({id,kind:cfg.kind,keyboard:true});continue;
    }
    let sample=await page.evaluate(id=>__mapAudit.sample(id),id);assert.ok(sample,'Selectable record '+id);assert.equal(sample.unique,sample.count,'Feature identity is unique '+id);
    await page.evaluate(({lon,lat,z})=>__mapAudit.move(lon,lat,z),{...sample,z:Math.max(14.3,cfg.minZ+.7)});
    await page.waitForFunction(()=>Object.values(__mapAudit.state().data).every(d=>!d.loading&&!d.pending));
    await page.locator('.um-search input').fill(sample.id);
    await page.waitForFunction(id=>Array.from(document.querySelectorAll('.um-result')).some(b=>b.dataset.id===id),sample.id);
    await page.locator('.um-result[data-id="'+sample.id+'"]' ).click();
    assert.equal((await page.evaluate(()=>__mapAudit.state())).selected,sample.id,'Record result selects exact identity '+id);
    assert.equal(await page.locator('.um-ptitle').textContent(),sample.name);
    const wiki=await page.locator('.um-links a').first().getAttribute('href');assert.match(wiki,/^https:\/\/en.wikipedia.org\/wiki\//,'Exact type link '+id);
    const rows=await page.locator('.um-facts > div').count();const flatFacts=id==='powerplants'?sample.facts.filter(r=>!r[0].startsWith('Generator ')):sample.facts;assert.equal(rows,flatFacts.length,'All source facts survive presentation '+id);if(id==='powerplants'&&sample.facts.length!==flatFacts.length)assert.ok(await page.locator('.um-unit-details').count(),'Generator history remains available in its disclosure');
    assert.ok(await page.locator('.um-links a').count()>1,'Dataset/record source links '+id);
    const coords=(await page.evaluate(()=>__mapAudit.state())).selectedCoordinates;
    assert.ok(Math.abs(coords[0]-sample.lon)<1e-8&&Math.abs(coords[1]-sample.lat)<1e-8,'Exact selected coordinate '+id);
    const timings=await page.evaluate(()=>__mapAudit.performance());coverage.push({id,kind:cfg.kind,selected:sample.id,records:sample.count,facts:rows,drawMs:timings});
    fs.writeFileSync(path.join(output,'progress.json'),JSON.stringify(coverage,null,2));await page.locator('.um-pback').click();await page.locator('.um-search input').fill('');
  }
  // A selection is independent of the map view, including zoom below a tile's display scale.
  await page.locator('[data-um-topic="water"]').click();await page.locator('.um-layers').evaluate(d=>d.open=true);
  if(await page.locator('[data-layer="services"]').getAttribute('aria-pressed')!=='true')await page.locator('[data-layer="services"]').click();
  await page.evaluate(()=>__mapAudit.move(-93.27,44.95,15));await page.waitForFunction(()=>__mapAudit.state().data.services.loaded>0&&!__mapAudit.state().data.services.pending);
  const pin=await page.evaluate(()=>__mapAudit.sample('services'));await page.locator('.um-search input').fill(pin.id);await page.locator('.um-result[data-id="'+pin.id+'"]' ).click();
  await page.evaluate(()=>__mapAudit.move(-92.83,45.12,10));await page.waitForFunction(()=>location.hash.includes('&pin='));
  await page.waitForTimeout(400);const hash=await page.evaluate(()=>location.hash),restore=await pageFor({width:390,height:844},hash);
  await restore.page.waitForFunction(id=>__mapAudit.state().selected===id,pin.id);
  const restored=(await restore.page.evaluate(()=>__mapAudit.state())).selectedCoordinates;
  assert.ok(Math.abs(restored[0]-pin.lon)<1e-8&&Math.abs(restored[1]-pin.lat)<1e-8,'Offscreen low-zoom bookmark restores exact coordinate');
  await restore.context.close();
  // Shared links land on a useful view without the harness scrolling for them.
  for(const size of [{width:1440,height:1000},{width:820,height:720},{width:390,height:844}]) {
    const directContext=await browser.newContext({viewport:size,reducedMotion:'reduce'});
    await directContext.route('https://www.googletagmanager.com/**',r=>r.abort());
    const direct=await directContext.newPage();direct.on('pageerror',e=>errors.push(e.message));
    await direct.goto(url+'/archive/under-the-street/under-the-street.html'+hash);
    await direct.waitForFunction(id=>window.__mapAudit?.state().selected===id,pin.id);
    const compact=size.width>=761&&size.height>=600;
    const target=direct.locator(compact?'#undermap':'.um-panel'),landing=await target.boundingBox();
    assert.ok(landing.y>=-2&&landing.y<90,'Shared record lands on its details at '+size.width);
    assert.equal(await direct.evaluate(()=>document.activeElement.className),'um-pback','Shared record focuses its Back control');
    await direct.locator('[data-pa="closer"]').click();
    const stage=await direct.locator('.um-stage').boundingBox();assert.ok(stage.y>=-2&&stage.y+stage.height<=size.height+2,'Inspector map action brings the whole map into view');
    assert.equal(await direct.evaluate(()=>document.activeElement.tagName),'CANVAS');
    await direct.waitForFunction(()=>+location.hash.match(/map=([\d.]+)/)[1]>=15.5);
    await direct.reload({waitUntil:'load'});
    await direct.waitForFunction(id=>window.__mapAudit?.state().selected===id,pin.id);
    const reloadLanding=await target.boundingBox();
    assert.ok(reloadLanding.y>=-2&&reloadLanding.y<90,'Refreshing a shared record keeps its Back control visible at '+size.width);
    assert.equal(await direct.evaluate(()=>document.activeElement.className),'um-pback');
    await direct.locator('[data-pa="closer"]').click();
    if(!compact){await direct.keyboard.press('Enter');await direct.waitForFunction(()=>!document.querySelector('.um-panel').hidden);const inspector=await direct.locator('.um-panel').boundingBox();assert.ok(inspector.y>=-2&&inspector.y<90,'Keyboard map inspection brings inline details into view');await direct.locator('.um-pback').click();const backMap=await direct.locator('.um-stage').boundingBox();assert.ok(backMap.y>=-2&&backMap.y+backMap.height<=size.height+2,'Back restores the visible map');assert.equal(await direct.evaluate(()=>document.activeElement.tagName),'CANVAS');}
    await directContext.close();
  }
  const mapContext=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),mapLink=await mapContext.newPage();
  await mapLink.goto(url+'/archive/under-the-street/under-the-street.html#map=10.2/44.985/-93.19&topic=tour');
  await mapLink.waitForFunction(()=>window.__mapAudit?.state().topic==='water'&&document.querySelectorAll('.um-result').length>0);
  const mapLanding=await mapLink.locator('#undermap').boundingBox();assert.ok(mapLanding.y>=-2&&mapLanding.y<90,'Shared map view lands on the explorer');await mapContext.close();
  // Read-only data fetch failures have an explicit retry path.
  let failed=false;
  const retry=await pageFor({width:390,height:844},'',async p=>p.route('**/data/osm-waterworks.json?*',r=>{if(!failed){failed=true;return r.abort();}return r.continue();}));
  await retry.page.locator('[data-um-topic="water"]').click();await retry.page.waitForFunction(()=>__mapAudit.state().data.waterworks?.error);
  await retry.page.locator('.um-layers').evaluate(d=>d.open=true);assert.match(await retry.page.locator('[data-layer="waterworks"] small').textContent(),/retry/i);
  await retry.page.locator('[data-layer="waterworks"]').click();await retry.page.waitForFunction(()=>__mapAudit.state().data.waterworks?.loaded>0&&!__mapAudit.state().data.waterworks.error);await retry.context.close();
  let catalogFailed=false;
  const catalogRetry=await pageFor({width:390,height:844},'',async p=>p.route('**/datasets.json?*',r=>{if(!catalogFailed){catalogFailed=true;return r.abort();}return r.continue();}));
  await catalogRetry.page.locator('.um-data').evaluate(d=>d.open=true);
  await catalogRetry.page.locator('[data-catalog-retry]').click();
  await catalogRetry.page.waitForFunction(()=>__mapAudit.layerInfo().bloomWater.bounds);
  await catalogRetry.page.locator('[data-um-source-scope="all"]').click();
  assert.equal(await catalogRetry.page.locator('.um-source-item').count(),JSON.parse(fs.readFileSync(path.join(root,'archive/under-the-street/assets/map/datasets.json'),'utf8')).datasets.length,'Catalog retry restores every registered source');
  assert.match(await catalogRetry.page.locator('.um-source-count').textContent(),/retrieval dates vary/,'Legacy retrieval dates are distinguished');
  await catalogRetry.context.close();
  const imagery=await pageFor({width:1024,height:768},'',async p=>{await p.route('https://basemap.nationalmap.gov/**',r=>r.abort());await p.route('https://imageserver.gisdata.mn.gov/**',r=>r.abort());});
  await imagery.page.locator('[data-um-base="sat"]').click();await imagery.page.waitForFunction(()=>__mapAudit.state().sat.failed);
  assert.match(await imagery.page.locator('.um-status').textContent(),/Aerial imagery could not load/);await imagery.page.locator('#undermap').screenshot({path:path.join(output,'imagery-fallback.png')});await imagery.context.close();
  fs.writeFileSync(path.join(output,'coverage.json'),JSON.stringify({layers:coverage,errors,localFailures,offscreenBookmark:{id:pin.id,expected:[pin.lon,pin.lat],restored}},null,2));
  await context.close();assert.deepEqual(errors,[]);assert.deepEqual(localFailures,[]);
  console.log('PASS '+coverage.length+' layers, unique identities, exact result coordinates, all facts and type/source links, keyboard depth, offscreen low-zoom bookmark, direct shared-link landing and refresh, visible inspector map actions, dataset/catalog retry and aerial fallback');
} finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
