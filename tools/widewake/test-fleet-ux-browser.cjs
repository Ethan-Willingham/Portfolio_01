/* Current Reach UI: real inputs, real holds, an earned delivery and 24 boats. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-fleet-ux');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,data)=>res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(f)]||'application/octet-stream'}).end(e?'Missing':data));});
let browser;const errors=[];
async function shot(p,name){await p.screenshot({path:path.join(out,name+'.png')});}
const ready=p=>p.waitForFunction(()=>__widewakeReach.view?.terrain.ready,null,{timeout:45000});
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,...(process.env.WIDEWAKE_TEST_BROWSER?{executablePath:process.env.WIDEWAKE_TEST_BROWSER}:{})});
  for(const [width,height,touch] of [[1440,900,false],[844,390,true],[667,375,true]]){
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
    const click=s=>touch?p.tap(s):p.click(s);
    await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await click('#start-voyage');await ready(p);
    assert.match(await p.locator('#charter-action').innerText(),/Plot course to Lantern/);await shot(p,width+'-harbor');
    await click('#charter-chart');await p.waitForFunction(()=>!document.getElementById('set-course').disabled);assert.equal(await p.locator('[data-port][aria-pressed=true]').getAttribute('data-port'),'lantern');
    assert.equal(await p.locator('[data-port]').first().getAttribute('data-port'),'lantern');await click('#set-course');
    await p.evaluate(()=>__widewakeReach.step(4500));await p.waitForTimeout(250);assert.equal(await p.evaluate(()=>__widewakeReach.game.arrived?.id),'lantern');
    await click('#context-action');assert.equal(await p.evaluate(()=>__widewakeReach.game.port),'lantern');assert.match(await p.locator('#charter-action').innerText(),/Sell your salt/);
    await click('#charter-chart');assert.equal(await p.locator('[data-side=sell]').getAttribute('aria-pressed'),'true');await click('[data-trade=sell]');assert.equal(await p.evaluate(()=>__widewakeReach.game.rank),2);await click('[data-close=port-service]');
    // Later fleet fixture uses real purchase, capacity and transfer mechanics.
    await p.evaluate(()=>{const g=__widewakeReach.game;g.coins=100000;g.rank=4;if(!g.hire('trawler'))throw Error('No worker berth');g.load('salt',10,g.player);__widewakeReach.refresh();});
    await click('#harbor-fleet');assert.equal(await p.locator('[data-fleet-ship]').count(),2);await click('[data-fleet-ship="0"]');
    const before=await p.evaluate(()=>({salt:__widewakeReach.game.amount('salt'),coins:__widewakeReach.game.coins}));
    await click('[data-fleet-action=transfer-max]');assert.ok(Number(await p.locator('#fleet-transfer-quantity').inputValue())>0);await click('[data-fleet-action=transfer]');assert.match(await p.locator('#fleet-feedback').innerText(),/Moved/);
    assert.deepEqual(await p.evaluate(()=>({salt:__widewakeReach.game.amount('salt'),coins:__widewakeReach.game.coins})),before);
    await click('[data-convoy-order=close]');assert.equal(await p.evaluate(()=>__widewakeReach.game.convoyOrder),'close');await shot(p,width+'-fleet-port');
    await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.id),'harbor-fleet');
    await click('[data-service=fleet]');await click('[data-service-tab=owned]');await click('[data-job=manage]');await click('[data-fleet-action=locate]');assert.equal(await p.locator('dialog[open]').count(),0,'Find must close the parent service');assert.equal(await p.evaluate(()=>__widewakeReach.mode),'port');await click('#cast-off');
    await p.keyboard.down('w');await p.keyboard.press('f');await p.keyboard.up('w');assert.ok(await p.locator('#reach-fleet').isVisible());assert.deepEqual(await p.evaluate(()=>__widewakeReach.input.keys),[]);
    const paused=await p.evaluate(()=>__widewakeReach.game.time);await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>__widewakeReach.game.time),paused);
    await click('[data-fleet-filter=workers]');assert.equal(await p.locator('[data-fleet-ship]').count(),1);await click('[data-fleet-action=locate]');assert.equal(await p.evaluate(()=>__widewakeReach.mode),'sailing');
    await click('#fleet-open');await click('[data-fleet-filter=attention]');assert.match(await p.locator('#fleet-roster').innerText(),/All boats/);await p.keyboard.press('Escape');
    await click('#reach-pause');await click('#menu-combat');await click('#fleet-open');assert.equal(await p.locator('[data-fleet-ship]').count(),24);
    const last=p.locator('[data-fleet-ship="23"]');await last.scrollIntoViewIfNeeded();await click('[data-fleet-ship="23"]');assert.equal(await last.getAttribute('aria-pressed'),'true');
    await click('[data-fleet-filter=workers]');assert.equal(await p.locator('[data-fleet-ship]').count(),4);await click('#fleet-recall');assert.match(await p.locator('#fleet-feedback').innerText(),/Fleet following|Fleet holding/);await shot(p,width+'-large-fleet');
    const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);
    for(const selector of ['[data-close=reach-fleet]','[data-fleet-filter=all]','[data-fleet-action=locate]']){const r=await p.locator(selector).boundingBox();assert.ok(r&&r.width>=44&&r.height>=44,selector+' target');}
    await ctx.close();console.log('PASS delivery, contextual trade, cargo transfer, orders, fleet camera, 24-boat filters and focus at '+width+'x'+height);
  }
  assert.deepEqual(errors,[]);console.log('Screenshots: '+out);
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
