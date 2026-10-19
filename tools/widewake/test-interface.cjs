/* Presentation and connected UI contracts for the independent game interface.
   Gameplay balance is covered by earned voyage tests; staged states here expose menus. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-interface');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.geojson':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);});});
let browser;const errors=[];
(async()=>{try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=process.env.WIDEWAKE_TEST_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'});
 for(const [name,width,height,touch] of [['desktop',1440,900,false],['compact-desktop',800,600,false],['portrait',390,844,true],['small-portrait',360,640,true],['landscape',844,390,true],['small-landscape',667,375,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await page.waitForFunction(()=>window.__widewake);await page.evaluate(()=>document.fonts.ready);
  const act=selector=>touch?page.tap(selector):page.click(selector),shot=name2=>page.screenshot({path:path.join(out,name+'-'+name2+'.png')});
  async function fit(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),name+' page overflow');}
  async function reachable(selector){const e=page.locator(selector);await e.scrollIntoViewIfNeeded();const r=await e.boundingBox();assert.ok(r&&r.width>=44&&r.height>=44,name+' small control '+selector);assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,name+' clipped control '+selector);}
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()),'#101627');assert.doesNotMatch(await page.locator('body').evaluate(e=>getComputedStyle(e).fontFamily),/Century|Georgia/i);await shot('title');
  await act('#start-voyage');await act('[data-close="departure-dialog"]');assert.equal(await page.locator('#port-panel').isVisible(),false);assert.equal(await page.locator('[data-tab]').count(),6);await fit();await shot('harbor');
  await act('[data-tab="trade"]');assert.equal(await page.locator('[data-action="select-good"]').count(),10);
  await act('[data-action="select-good"][data-id="sugar"]');await act('[data-qty="1"]');
  const before=await page.evaluate(()=>({coins:__widewake.game.s.coins,qty:__widewake.game.quantity('sugar'),quote:__widewake.game.quoteTrade('sugar',1,true)}));
  // The main order remains visible on a fresh panel, without scrolling away from its selection.
  const box=await page.locator('[data-action="buy"]').boundingBox(),panel=await page.locator('#port-panel').boundingBox();assert.ok(box.y>=panel.y&&box.y+box.height<=panel.y+panel.height+1,name+' order hidden below panel');
  await reachable('[data-action="buy"]');await act('[data-action="buy"]');
  assert.equal(await page.evaluate(()=>__widewake.game.s.coins),before.coins-before.quote.total);assert.equal(await page.evaluate(()=>__widewake.game.quantity('sugar')),before.qty+1);
  assert.match(await page.innerText('#trade-feedback'),/Bought 1 sugar/);assert.equal(await page.locator('#toasts').innerText(),'');assert.equal(await page.getAttribute('[data-action="select-good"][data-id="sugar"]','aria-pressed'),'true');
  await act('[data-action="select-good"][data-id="fish"]');assert.equal(await page.locator('[data-action="buy"]').getAttribute('data-id'),'fish');assert.equal(await page.innerText('#trade-feedback'),'');await shot('trade');
  await act('[data-action="compare-good"]');assert.equal(await page.locator('#chart-dialog').isVisible(),true);await page.waitForFunction(()=>!document.getElementById('plot-course').disabled);await reachable('#plot-course');await shot('chart');await act('[data-close="chart-dialog"]');
  for(const tab of ['fleet','yard','voyage','jobs','log']){await act('[data-tab="'+tab+'"]');await fit();assert.ok(await page.locator('#port-panel').isVisible());await shot(tab);}
  await act('#service-back');assert.equal(await page.locator('#port-panel').isVisible(),false);await act('#cast-off');await page.waitForFunction(()=>__widewake.game.mode==='sea');
  await page.evaluate(()=>{__widewake.game.paused=true;document.getElementById('toasts').replaceChildren();__widewake.render();});
  assert.equal(await page.locator('#fleet-row').isVisible(),false);assert.equal(await page.locator('.ww-controls').isVisible(),false);assert.equal(await page.locator('#sound-toggle').isVisible(),false);assert.equal(await page.locator('#sea-pause').isVisible(),false);
  assert.ok((await page.innerText('#sea')).trim().split(/\s+/).length<65,name+' crowded resting sea HUD');await fit();await shot('sea');
  for(const id of ['convoy-open','broadside','field-repair','sea-chart','settings-open','zoom-in','zoom-out'])await reachable('#'+id);
  if(touch)assert.doesNotMatch(await page.innerText('#context-action'),/\(E\)/);
  await act('#convoy-open');assert.ok(await page.locator('#formation').isVisible());await act('#formation');await reachable('[data-close="convoy-dialog"]');await shot('convoy');await act('[data-close="convoy-dialog"]');
  await act('#settings-open');await shot('settings');await act('#return-title');assert.ok(await page.locator('#continue-voyage').isVisible());await fit();await context.close();
  console.log('PASS '+name+' hub, selected trade, exact purchase, chart, services, quiet sea, convoy and save/title');
 }
 const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await page.waitForFunction(()=>window.__widewake);
 const ports=await page.evaluate(()=>{const canvases=WidewakeData.ports.map(p=>WidewakeRender.harborBase(p));return{count:canvases.length,scenes:new Set(canvases.map(c=>c.toDataURL())).size,palettes:new Set(Object.values(WidewakeRender.harborStyles).map(s=>[s.sky,s.water,s.wall,s.roof].join(','))).size};});assert.deepEqual(ports,{count:24,scenes:24,palettes:24});await context.close();
 assert.deepEqual(errors,[]);console.log('PASS 24 distinct harbor scenes and palettes; no uncaught browser errors');console.log('Artifacts: '+out);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
