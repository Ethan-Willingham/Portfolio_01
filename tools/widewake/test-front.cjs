/* The launcher must never create or advance a voyage until the captain starts it. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-front-checks');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.geojson':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});});
let browser;const errors=[];
const check=msg=>console.log('PASS '+msg);
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  browser=process.env.WIDEWAKE_TEST_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:process.env.WIDEWAKE_TEST_BROWSER||'/Users/ethan/.local/bin/agent-chrome-for-testing'});
  async function boot(context){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/widewake.html?test');await p.waitForFunction(()=>window.__widewake);await p.evaluate(()=>document.fonts.ready);return p;}
  const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await boot(context);
  assert.equal(await p.locator('#title-screen').isVisible(),true);assert.equal(await p.locator('#continue-voyage').isVisible(),false);
  assert.equal(await p.evaluate(()=>localStorage.getItem('widewake-save-v2')),null);
  assert.equal(await p.evaluate(()=>Array.from(document.styleSheets).some(s=>s.href?.endsWith('/style.css'))),false);
  const seconds=await p.evaluate(()=>__widewake.game.s.seconds);await p.keyboard.press('m');await p.keyboard.press('c');await p.keyboard.press('w');await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>__widewake.game.s.seconds),seconds);assert.equal(await p.locator('dialog[open]').count(),0);
  await p.screenshot({path:path.join(out,'title-desktop.png')});
  await p.click('#title-settings');await p.uncheck('#sound-enabled');await p.check('#reduced-motion');await p.click('[data-close="settings-dialog"]');
  assert.equal(await p.evaluate(()=>localStorage.getItem('widewake-save-v2')),null);await p.reload();await p.waitForFunction(()=>window.__widewake);
  assert.equal(await p.evaluate(()=>__widewake.game.s.settings.sound),false);assert.equal(await p.evaluate(()=>__widewake.game.s.settings.reduceMotion),true);
  const scene=await p.locator('#title-sea').evaluate(c=>c.toDataURL());await p.waitForTimeout(180);assert.equal(await p.locator('#title-sea').evaluate(c=>c.toDataURL()),scene);
  check('dedicated title, no blog dependency, no phantom save, frozen campaign, and persistent preferences');
  await p.click('#start-voyage');assert.ok(await p.locator('#departure-dialog').isVisible());assert.equal(await p.evaluate(()=>__widewake.game.s.settings.sound),false);
  await p.click('#first-course');assert.equal(await p.inputValue('#destination-list'),'nassau');await p.click('#plot-course');await p.waitForFunction(()=>__widewake.game.mode==='sea'&&!document.getElementById('chart-dialog').open);
  await p.waitForTimeout(180);await p.click('#settings-open');await p.click('#return-title');
  assert.equal(await p.locator('#continue-voyage').isVisible(),true);assert.match(await p.locator('#title-save').innerText(),/At sea/);
  const snap=await p.evaluate(()=>JSON.stringify(__widewake.game.snapshot()));await p.waitForTimeout(180);assert.equal(await p.evaluate(()=>JSON.stringify(__widewake.game.snapshot())),snap);
  await p.click('#start-voyage');assert.ok(await p.locator('#reset-dialog').isVisible());await p.click('[data-close="reset-dialog"]');assert.equal(await p.evaluate(()=>JSON.stringify(__widewake.game.snapshot())),snap);
  await p.reload();await p.waitForFunction(()=>window.__widewake);assert.equal(await p.evaluate(()=>__widewake.atTitle),true);assert.equal(await p.locator('dialog[open]').count(),0);assert.match(await p.locator('#title-save').innerText(),/At sea/);
  const preserved=await p.evaluate(()=>localStorage.getItem('widewake-save-v2'));
  assert.match(await p.locator('#title-version').innerText(),/^0\.21\.0/);
  for(const trial of ['estuary','battle']){
    await p.click('#title-ocean');await p.click('#ocean-dialog a[href="widewake-'+trial+'.html"]');
    const resume=trial==='estuary'?'#reach-resume':'#resume',menu=trial==='estuary'?'#reach-menu':'#battle-menu',pause=trial==='estuary'?'#reach-pause':'#pause';
    await p.waitForFunction(id=>{const b=document.querySelector(id);return b&&!b.disabled;},resume);await p.click(resume);await p.waitForTimeout(120);assert.equal(await p.locator(menu).evaluate(d=>d.open),false);await p.click(pause);
    assert.match(await p.locator(menu+' small').innerText(),/^0\.21\.0/);await p.click(menu+' a[href="widewake.html"]');await p.locator('#title-screen').waitFor({state:'visible'});
    assert.equal(await p.evaluate(()=>localStorage.getItem('widewake-save-v2')),preserved);assert.ok(await p.locator('#continue-voyage').isVisible());
  }
  await p.goto(base+'/widewake.html?test');await p.waitForFunction(()=>window.__widewake);
  check('both current ocean trials launch from the title and return without altering the saved voyage');
  await p.screenshot({path:path.join(out,'title-continue.png')});await p.click('#continue-voyage');assert.equal(await p.locator('#sea').isVisible(),true);assert.equal(await p.evaluate(()=>__widewake.game.paused),false);
  await p.click('#settings-open');await p.click('#settings-handbook');await p.keyboard.press('Escape');assert.ok(await p.locator('#settings-dialog').isVisible());assert.equal(await p.evaluate(()=>__widewake.game.paused),true);
  await p.click('#return-title');await p.click('#start-voyage');await p.click('#confirm-reset');assert.ok(await p.locator('#departure-dialog').isVisible());assert.equal(await p.evaluate(()=>__widewake.game.s.coins),780);
  await p.click('[data-close="departure-dialog"]');await p.click('#settings-open');await p.click('#return-title');await p.click('#title-settings');
  const save=await p.evaluate(()=>localStorage.getItem('widewake-save-v2'));await p.setInputFiles('#save-file',{name:'fleet.json',mimeType:'application/json',buffer:Buffer.from(save)});
  await p.waitForFunction(()=>document.getElementById('save-message').textContent.includes('restored'));await p.click('[data-close="settings-dialog"]');assert.ok(await p.locator('#title-screen').isVisible());await p.click('#continue-voyage');assert.ok(await p.locator('#harbor').isVisible());
  check('first course, save and title round trip, reload, nested pause, confirmed restart, and title import');
  await context.close();
  for(const [name,width,height,touch]of [['landscape',844,390,true],['portrait',390,844,true],['small-phone',360,640,true],['short-phone',667,375,true],['small-window',800,600,false]]){
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),page=await boot(ctx);
    await page.screenshot({path:path.join(out,name+'-title.png')});
    async function contained(){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),name+' page must fit the viewport');}
    await contained();await page.click('#title-handbook');assert.ok(await page.locator('#handbook-dialog').isVisible());await page.click('[data-close="handbook-dialog"]');await page.click('#start-voyage');await page.click('[data-close="departure-dialog"]');await contained();await page.click('[data-tab="trade"]');
    assert.ok(await page.evaluate(()=>{const buy=document.querySelector('[data-action=buy][data-id=sugar]').getBoundingClientRect(),panel=document.getElementById('port-panel').getBoundingClientRect();return buy.top>=panel.top&&buy.bottom<=panel.bottom;}),name+' first trade must be visible without scrolling');await page.screenshot({path:path.join(out,name+'-harbor.png')});await page.click('[data-action="select-good"][data-id="pearl"]');await page.locator('[data-action="sell"][data-id="pearl"]').scrollIntoViewIfNeeded();assert.ok(await page.locator('[data-action="sell"][data-id="pearl"]').isVisible());await contained();
    await page.click('#cast-off');await page.waitForFunction(()=>__widewake.game.mode==='sea');
    if(name==='landscape'){
      await page.click('#settings-open');await page.uncheck('#autofire');await page.click('[data-close="settings-dialog"]');const ocean=await page.locator('#ocean').boundingBox();
      await page.locator('#ocean').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:ocean.x+ocean.width*.65,clientY:ocean.y+ocean.height*.5});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>__widewake.game.bullets.some(b=>!b.hostile)),'touch manual cannon fire');await page.locator('#ocean').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch'});
      const stick=await page.locator('#joystick').boundingBox();await page.locator('#joystick').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:stick.x+stick.width,clientY:stick.y+stick.height/2});assert.ok(await page.locator('#joystick').evaluate(el=>el.classList.contains('ww-full-steam')));await page.waitForTimeout(180);await page.click('#settings-open');assert.equal(await page.locator('#joystick').evaluate(el=>el.classList.contains('ww-full-steam')),false);await page.locator('#joystick').dispatchEvent('pointermove',{pointerId:1,pointerType:'touch',clientX:stick.x+stick.width,clientY:stick.y});assert.equal(await page.locator('#joystick').evaluate(el=>el.classList.contains('ww-full-steam')),false);await page.click('[data-close="settings-dialog"]');
      await page.click('#settings-open');const heldTime=await page.evaluate(()=>__widewake.game.s.seconds);await page.setViewportSize({width:390,height:844});await contained();assert.equal(await page.evaluate(()=>__widewake.game.s.seconds),heldTime);await page.setViewportSize({width:844,height:340});await contained();assert.equal(await page.evaluate(()=>__widewake.game.s.seconds),heldTime);await page.setViewportSize({width,height});await page.click('[data-close="settings-dialog"]');
      check('manual touch fire, full-steam helm feedback, cleared input, and pause across rotation and height changes');
    }
    await page.screenshot({path:path.join(out,name+'-sea.png')});await contained();await page.click('#settings-open');await page.click('#return-title');await page.screenshot({path:path.join(out,name+'-continue.png')});await contained();
    const overlap=await page.evaluate(()=>{const buttons=[...document.querySelectorAll('#title-screen button')].filter(b=>!b.hidden),boxes=buttons.map(b=>({id:b.id,r:b.getBoundingClientRect()}));return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>a.r.left<b.r.right&&a.r.right>b.r.left&&a.r.top<b.r.bottom&&a.r.bottom>b.r.top).map(b=>a.id+' overlaps '+b.id));});assert.deepEqual(overlap,[],name+' menu overlap');
    await page.click('#continue-voyage');assert.ok(await page.locator('#sea').isVisible());await ctx.close();check(name+' launch, harbor scrolling, sea and continue layouts');
  }
  const backupContext=await browser.newContext();await backupContext.addInitScript(valid=>{localStorage.setItem('widewake-save-backup-v2',valid);localStorage.setItem('widewake-save-v2','broken');},save);const bp=await boot(backupContext);assert.match(await bp.locator('#title-storage').innerText(),/Recovered/);assert.ok(await bp.locator('#continue-voyage').isVisible());await bp.click('#continue-voyage');assert.equal(await bp.locator('#port-name').innerText(),'Havana');await backupContext.close();
  const recovered=await browser.newContext();await recovered.addInitScript(()=>{const s={version:1};localStorage.setItem('widewake-save-v2',JSON.stringify(s));});const rp=await boot(recovered);assert.match(await rp.locator('#title-storage').innerText(),/could not be read/);assert.equal(await rp.evaluate(()=>localStorage.getItem('widewake-save-v2')),'{"version":1}');await recovered.close();
  const unavailable=await browser.newContext();await unavailable.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('Blocked','SecurityError');};Storage.prototype.setItem=()=>{throw new DOMException('Blocked','SecurityError');};});const up=await boot(unavailable);assert.match(await up.locator('#title-storage').innerText(),/unavailable/);await up.click('#start-voyage');await up.click('[data-close="departure-dialog"]');await up.click('#settings-open');assert.match(await up.locator('#save-message').innerText(),/unavailable/);assert.equal(await up.locator('#export-save').isEnabled(),true);await unavailable.close();
  check('unreadable and unavailable storage do not silently overwrite or prevent play');
  assert.deepEqual(errors,[]);check('no uncaught browser errors');console.log('Screenshots: '+out);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
