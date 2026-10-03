// Uses an owned Chrome for Testing process and closes it even on failure.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, launchOptions } = require('./browser-support.cjs');
const root = path.resolve(__dirname, '../..');
const output = process.env.UNDER_MAP_TEST_OUTPUT || '/tmp/under-street-qa';
fs.mkdirSync(output, { recursive: true });
const errors = [], localFailures = [], requests = [];
let browser;
const hooks = `
window.__mapAudit = {
  state:()=>({topic,view:{...view},W,H,selected:selection&&selection.id,data:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,{loading:v.loading,error:v.error,pending:v.pending,count:v.count,loaded:v.features&&v.features.length}]))}),
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
async function pageFor(size,hash='',options={}) {
  const context=await browser.newContext({viewport:size,reducedMotion:options.motion||'reduce',deviceScaleFactor:size.width<600?2:1,hasTouch:size.width<600});
  await context.route('https://www.googletagmanager.com/**',r=>r.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(url)){requests.push(r.url());if(r.status()>=400)localFailures.push(r.url());}});
  if(options.configure)await options.configure(page);
  await page.goto(url+'/archive/under-the-street/under-the-street.html'+hash);
  if(!options.natural)await page.locator('#undermap').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>window.__mapAudit && document.querySelectorAll('.um-result').length>0);
  await page.evaluate(()=>document.fonts.ready);
  return {page,context};
}
let url;
async function assertViewportFit(page,size) {
  if(size.width<761||size.height<600)return;
  const frame=await page.locator('.um-shell').evaluate(n=>({height:n.getBoundingClientRect().height,overflow:n.scrollHeight-n.clientHeight}));
  const stage=await page.locator('.um-stage').boundingBox();
  assert.ok(frame.height<=size.height-40,'Demo fits a normal browser viewport '+JSON.stringify(size));
  assert.ok(frame.overflow<=2,'Closed demo needs no internal frame scroll '+JSON.stringify(size));
  assert.ok(stage.height>=239,'Map remains usable in the compact frame');
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false,'Viewport fit does not require fullscreen');
}
(async()=>{try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch(launchOptions);
  const desktop={width:1440,height:800}, {page,context}=await pageFor(desktop);
  await page.waitForFunction(()=>__mapAudit.state().data.contextRoads);
  const initial=await page.evaluate(()=>__mapAudit.state());
  assert.equal(initial.topic,'tour');assert.equal(initial.selected,null);
  assert.ok(!initial.data.services&&!initial.data.interceptors,'opening the map does not fetch all systems');
  assert.equal(await page.locator('.um-topics button').count(),8);
  assert.equal(await page.locator('.rail,.top-nav').count(),0,'Removed article navigation stays removed');
  assert.doesNotMatch(await page.locator('.u-hero').textContent(),/field guide/i);
  await assertViewportFit(page,desktop);
  await page.locator('#undermap').screenshot({path:path.join(output,'desktop-start.png')});
  await page.locator('[data-id="511"]').click();
  assert.match(await page.locator('.um-ptitle').textContent(),/511/);
  await page.waitForFunction(()=>document.querySelector('.um-pimg img')?.complete);
  const title=await page.locator('.um-ptitle').boundingBox(),photo=await page.locator('.um-pimg').boundingBox();
  assert.ok(title.y+title.height<=photo.y,'Record identity appears before its photograph');
  await page.locator('#undermap').screenshot({path:path.join(output,'desktop-place.png')});
  const box=await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x+box.width/2+60,box.y+box.height/2+60);
  assert.equal((await page.evaluate(()=>__mapAudit.state())).selected,'511','hover does not replace a selected place');
  await page.locator('.um-pback').click();
  assert.equal(await page.evaluate(()=>document.activeElement?.dataset.id),'511','Back returns focus to the selected place');
  for(const topic of ['water','wastewater','storm','power','gas','networks','ground']) {
    await page.locator('[data-um-topic="'+topic+'"]').click();
    await page.waitForFunction(()=>Object.values(__mapAudit.state().data).every(d=>!d.loading&&!d.pending));
    assert.equal((await page.evaluate(()=>__mapAudit.state())).topic,topic);
    await assertViewportFit(page,desktop);
    await page.locator('#undermap').screenshot({path:path.join(output,topic+'.png')});
  }
  const loaded=await page.evaluate(()=>__mapAudit.state());console.log('Loaded systems:',JSON.stringify(loaded.data));
  await page.locator('[data-um-topic="water"]').click();
  await page.evaluate(()=>__mapAudit.move(-93.27,44.95,15));
  await page.waitForFunction(()=>__mapAudit.state().data.services?.loaded>0&&!__mapAudit.state().data.services.pending);
  assert.ok((await page.evaluate(()=>__mapAudit.state())).data.services.loaded<99774,'service inventory is loaded by neighborhood');
  await page.evaluate(()=>__mapAudit.select('services'));
  assert.ok(await page.locator('.um-links a[href*="ServiceLineInventory_Public"]').count(),'service record has its actual source');
  const serviceHash=await page.evaluate(()=>location.hash), serviceId=(await page.evaluate(()=>__mapAudit.state())).selected;
  const restored=await pageFor({width:1024,height:768},serviceHash);
  await restored.page.waitForFunction(id=>__mapAudit.state().selected===id,serviceId);
  await restored.context.close();
  await page.locator('[data-um-topic="ground"]').click();
  await page.waitForFunction(()=>!!__mapAudit.state().data.depth?.count);
  await page.evaluate(()=>__mapAudit.move(-93.2,44.95,12));
  const depthHit=await page.evaluate(()=>{const f=__mapAudit.hit(__mapAudit.state().W/2,__mapAudit.state().H/2);return f&&{name:f.name,id:f.id};});
  assert.match(depthHit.name,/ft to bedrock/);
  const timings=await page.evaluate(()=>__mapAudit.performance());console.log('Map draw ms:',timings.map(n=>n.toFixed(2)).join(', '));
  await context.close();
  for(const motion of ['reduce','no-preference'])for(const size of [{width:1440,height:800},{width:820,height:720}]){
    const {page,context}=await pageFor(size,'#undermap',{natural:true,motion,configure:p=>p.route('**/assets/map/media.json?*',async r=>{await new Promise(resolve=>setTimeout(resolve,650));await r.continue();})});
    await page.waitForFunction(()=>document.querySelector('.um-result-thumb img')?.naturalWidth>0);
    await page.waitForTimeout(650);
    let frame=await page.locator('.um-shell').boundingBox();assert.ok(frame.y>=-2&&frame.y+frame.height<=size.height+2,'Delayed photographs keep the direct map link entirely visible with '+motion);
    await page.locator('[data-id="511"]').click();await page.waitForFunction(()=>__mapAudit.state().view.z>=15.99);
    await page.waitForFunction(()=>document.querySelector('.um-pimg img')?.naturalWidth>0);
    frame=await page.locator('.um-shell').boundingBox();assert.ok(frame.y>=-2&&frame.y+frame.height<=size.height+2,'Selecting a place after loading preserves the entire demo');
    await context.close();
  }
  for(const size of [{width:1512,height:850},{width:1280,height:720},{width:1024,height:768},{width:820,height:720},{width:780,height:740},{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
    const {page,context}=await pageFor(size);
    await assertViewportFit(page,size);
    if(size.width>=761&&size.height>=600){
      const column=await page.locator('.descent > .col').boundingBox();assert.ok(Math.abs(column.x+column.width/2-size.width/2)<1,'Article remains centered');
      await page.locator('[data-um-topic="ground"]').click();await page.waitForFunction(()=>Object.values(__mapAudit.state().data).every(d=>!d.loading&&!d.pending));
      await assertViewportFit(page,size);
      await page.locator('[data-um-topic="tour"]').click();
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no page overflow '+JSON.stringify(size));
    const targets=await page.locator('#undermap button:visible').evaluateAll(bs=>bs.filter(b=>{const r=b.getBoundingClientRect();return r.width<43.5||r.height<43.5;}).map(b=>b.outerHTML));
    assert.deepEqual(targets,[],'44px visible controls '+JSON.stringify(size));
    const dims=await page.locator('canvas').boundingBox(),stage=await page.locator('.um-stage').boundingBox();
    assert.ok(Math.abs(dims.width-stage.width)<2,'canvas uses CSS pixels at all device scales');
    if(size.width<600)assert.match(await page.locator('canvas').evaluate(c=>getComputedStyle(c).touchAction),/pan-y/,'page scroll works over the map');
    await page.locator('[data-id="highland"]').click();
    if(size.width>=761&&size.height>=600){
      const inspector=await page.locator('.um-panel').evaluate(n=>({height:n.clientHeight,content:n.scrollHeight}));assert.ok(inspector.content>inspector.height,'Record details scroll inside the frame');
      await page.locator('[data-pa="closer"]').click();const frame=await page.locator('.um-shell').boundingBox();assert.ok(frame.y>=-2&&frame.y+frame.height<=size.height+2,'Map action keeps the entire demo visible');
    }
    await page.locator('#undermap').screenshot({path:path.join(output,'place-'+size.width+'x'+size.height+'.png')});
    await page.locator('.um-data').evaluate(d=>d.open=true);
    await page.locator('[data-um-source-scope="all"]').click();
    await page.locator('.um-source-search input').fill('Named seven-county');
    await page.waitForFunction(()=>document.querySelectorAll('.um-source-item').length===1);
    const card=page.locator('.um-source-item'),notes=card.locator('.um-source-notes');
    assert.match(await card.locator('a[download]').textContent(),/GeoJSON \(gzip\).*19.5 MB/,'Compressed complete download and size are visible');
    assert.equal(await notes.getAttribute('open'),null,'Detailed source notes start folded');
    const noteTarget=await notes.locator('summary').boundingBox();assert.ok(noteTarget.width>=43.5&&noteTarget.height>=43.5,'Source disclosure has a44px target');
    await card.screenshot({path:path.join(output,'source-card-'+size.width+'x'+size.height+'.png')});
    await notes.locator('summary').focus();await page.keyboard.press('Enter');
    assert.ok(await notes.locator('p').isVisible(),'Source caveats open with the keyboard');
    assert.ok(await notes.locator('small').isVisible(),'Redistribution terms remain available');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Source card has no overflow');
    await context.close();
  }
  console.log('Page errors:',errors);console.log('Local failures:',localFailures);
  assert.deepEqual(errors,[]);assert.deepEqual(localFailures,[]);
  console.log('PASS topic loading, source links, selection persistence, tile deep links, depth, laptop viewport fit, centered article, responsive layouts, touch targets and compact source disclosures');
} finally {
  if(browser)await browser.close();await new Promise(r=>server.close(r));
}})().catch(e=>{console.error(e);process.exitCode=1;});
