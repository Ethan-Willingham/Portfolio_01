// Uses an owned Chrome for Testing process and closes it even on failure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, launchOptions } = require('./browser-support.cjs');
const root = path.resolve(__dirname, '../..');
const output = process.env.UNDER_MAP_TEST_OUTPUT || '/tmp/under-street-locator-qa';
fs.mkdirSync(output, { recursive: true });
const errors = [], localFailures = [], requests = [];
let browser;
const hooks = `
window.__mapAudit = {
  state:()=>({topic,view:{...view},W,H,selected:selection&&selection.id,selectedCoordinates:selection&&[lonOf(selection.x),latOf(selection.y)],sat:{on:SAT.on,failed:SAT.failed},data:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,{loading:v.loading,error:v.error,pending:v.pending,count:v.count,loaded:v.features&&v.features.length}]))}),
  results:()=>resultItems.map(f=>({id:f.id,visible:visible(f)})),
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
  const civic={address:'350 5th St S, Minneapolis, Minnesota, 55415',score:99.87,location:{x:-93.265695,y:44.977383}};
  const other={address:'350 5th St N, Minneapolis, Minnesota, 55401',score:93.29,location:{x:-93.2754,y:44.986}};
  const fixture={spatialReference:{wkid:4326},candidates:[civic,other,{...civic}, {address:'Outside metro',score:100,location:{x:-77,y:38}}, {address:'Weak match',score:79,location:{x:-93.2,y:44.9}}, {address:'Invalid location',score:100,location:{x:null,y:null}}]};
  const cases=[];
  for(const size of [{width:1440,height:1000},{width:1024,height:768},{width:820,height:720},{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
    let mode='matches',queries=[];
    const {page,context}=await pageFor(size,'',async p=>p.route('**/AddressPointsMetro/GeocodeServer/findAddressCandidates?*',async r=>{
      const u=new URL(r.request().url());queries.push(u.searchParams.get('SingleLine'));
      if(mode==='failure')return r.fulfill({status:503,body:'Unavailable'});
      if(mode==='stale'){await new Promise(resolve=>setTimeout(resolve,700));return r.fulfill({contentType:'application/json',body:JSON.stringify({spatialReference:{wkid:4326},candidates:[{...civic,address:'Stale result'}]})});}
      return r.fulfill({contentType:'application/json',body:JSON.stringify(mode==='empty'?{spatialReference:{wkid:4326},candidates:[fixture.candidates[3],fixture.candidates[4]]}:fixture)});
    }));
    await page.locator('#um-address').fill('350 S 5th St, Minneapolis, MN');assert.equal(queries.length,0,'No automatic keystroke search');
    await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelectorAll('.um-address-matches button').length===2);
    assert.match(await page.locator('.um-address-output [role="status"]').textContent(),/Choose/);assert.equal(await page.locator('.um-results .um-result').count(),11,'Address query does not filter the separate system record list');
    assert.equal((await page.evaluate(()=>__mapAudit.state())).selected,null,'Address query does not select an infrastructure record');
    assert.notEqual((await page.evaluate(()=>__mapAudit.state())).view.z,15.5,'Ambiguous matches do not silently move map');
    await page.locator('.um-address-matches button').first().click();
    const v=(await page.evaluate(()=>__mapAudit.state())).view,lon=v.x*360-180,lat=Math.atan(Math.sinh(Math.PI-2*Math.PI*v.y))*180/Math.PI;
    assert.ok(Math.abs(lon-civic.location.x)<1e-8&&Math.abs(lat-civic.location.y)<1e-8,'Candidate centers correct coordinates');assert.equal(v.z,15.5);
    assert.equal(await page.evaluate(()=>document.activeElement.tagName),'CANVAS');
    assert.match(await page.locator('.um-address-output [role="status"]').textContent(),/Showing 350 5th St S/);
    await page.locator('#undermap').screenshot({path:path.join(output,'address-'+size.width+'x'+size.height+'.png')});
    mode='empty';await page.locator('#um-address').fill('1600 Pennsylvania Avenue NW, Washington, DC');await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelector('.um-address-output [role="status"]').textContent.includes('No matching address'));
    assert.equal(await page.locator('.um-address-matches button').count(),0,'Weak or outside records are rejected');
    mode='failure';await page.locator('#um-address').fill('15 Kellogg Blvd W, Saint Paul, MN');await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelector('.um-address-output [role="status"]').textContent.includes('could not load'));assert.equal(await page.locator('.um-address-row button').isDisabled(),false,'Failed locator can retry');
    mode='matches';await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelectorAll('.um-address-matches button').length===2);
    mode='stale';await page.locator('#um-address').fill('Old civic address');await page.locator('.um-address-row button').click();
    await page.locator('#um-address').fill('New civic address');mode='matches';await page.locator('.um-address-row button').click();await page.waitForFunction(()=>document.querySelectorAll('.um-address-matches button').length===2);
    await page.waitForTimeout(850);assert.doesNotMatch(await page.locator('.um-address-matches').textContent(),/Stale/,'Canceled query cannot replace newer matches');
    await page.locator('#um-city').selectOption('eagan');assert.equal(await page.locator('#um-address').inputValue(),'');assert.equal(await page.locator('.um-address-output').isVisible(),false,'City navigation clears stale address results');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No locator overflow '+JSON.stringify(size));
    const small=await page.locator('.um-location-controls :is(input,select,button)').evaluateAll(ns=>ns.filter(n=>{const r=n.getBoundingClientRect();return r.width<43.5||r.height<43.5;}).map(n=>n.outerHTML));assert.deepEqual(small,[],'44px location targets');
    assert.equal(await page.locator('.um-browse-controls').isVisible(),false,'Curated tour keeps its list simple');
    await page.locator('[data-um-topic="water"]').click();
    await page.waitForFunction(()=>__mapAudit.state().data.eaganWater?.loaded>0 && Array.from(document.querySelectorAll('.um-result')).some(b=>b.dataset.id.startsWith('eaganWater-')));
    assert.equal(await page.locator('[data-um-scope="view"]').getAttribute('aria-pressed'),'true','City navigation shows nearby records');
    assert.ok((await page.evaluate(()=>__mapAudit.results())).every(r=>r.visible),'Every city result is in the view');
    await page.locator('.um-search input').fill('no-record-at-selected-city');
    await page.locator('#um-city').selectOption('bloomington');
    assert.equal(await page.locator('.um-search input').inputValue(),'','City navigation clears a stale record filter');
    await page.waitForFunction(()=>__mapAudit.state().data.bloomWater?.loaded>0 && Array.from(document.querySelectorAll('.um-result')).some(b=>b.dataset.id.startsWith('bloomWater-')));
    assert.ok((await page.evaluate(()=>__mapAudit.results())).every(r=>r.visible),'Bloomington results are near the selected city');
    await page.locator('#um-city').selectOption('metro');
    assert.equal(await page.locator('[data-um-scope="all"]').getAttribute('aria-pressed'),'true','Regional navigation restores broad browsing');
    await page.locator('.um-search input').fill('another-stale-filter');
    await page.locator('#um-address').fill('350 S 5th St, Minneapolis, MN');await page.locator('.um-address-row button').click();
    await page.waitForFunction(()=>document.querySelectorAll('.um-address-matches button').length===2);await page.locator('.um-address-matches button').first().click();
    assert.equal(await page.locator('.um-search input').inputValue(),'','Address navigation clears a stale record filter');
    assert.equal(await page.locator('[data-um-scope="view"]').getAttribute('aria-pressed'),'true','Address navigation shows nearby records');
    await page.waitForFunction(()=>__mapAudit.state().data.services?.loaded>0 && __mapAudit.results().length>0);
    assert.ok((await page.evaluate(()=>__mapAudit.results())).every(r=>r.visible),'Address results are in the view');
    cases.push({size,queries:queries.length,nearbyCityAndAddress:true,passed:true});await context.close();
  }
  // One real civic query verifies the public service schema and browser CORS.
  const live=await pageFor({width:1024,height:768});await live.page.locator('#um-address').fill('15 Kellogg Blvd W, Saint Paul, MN');await live.page.locator('.um-address-row button').click();
  await live.page.waitForFunction(()=>document.querySelectorAll('.um-address-matches button').length>0,null,{timeout:15000});
  await live.page.locator('.um-address-matches button').first().click();const liveView=(await live.page.evaluate(()=>__mapAudit.state())).view;
  assert.ok(Math.abs(liveView.x*360-180-(-93.093687))<.001,'Live Saint Paul civic query is correctly located');await live.context.close();
  fs.writeFileSync(path.join(output,'locator-audit.json'),JSON.stringify({cases,errors,localFailures,liveCivicQuery:true},null,2));assert.deepEqual(errors,[]);assert.deepEqual(localFailures,[]);
  console.log('PASS six-size address matching, explicit choice, geographic and score filters, network retry, canceled requests, city reset, nearby city/address records, targets/overflow and live regional CORS query');
} finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
