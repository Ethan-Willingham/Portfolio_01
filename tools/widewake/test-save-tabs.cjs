/* Two real same-origin windows must never write stale fleets over each other. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,webkit}=require('playwright'),{boss,dense,make,place,C,earth}=require('./sea-fixtures.cjs');
const root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-tab-checks');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.geojson':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(data);});});
let browser,base;const errors=[],check=name=>console.log('PASS '+name),SAVE='widewake-save-v2',BACKUP='widewake-save-backup-v2';
async function focus(p){await p.bringToFront();await p.evaluate(()=>window.dispatchEvent(new Event('focus')));}
async function boot(context){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/widewake.html?test');await p.waitForFunction(()=>window.__widewake);await focus(p);return p;}
async function fresh(p){await focus(p);await p.click('#start-voyage');await p.click('[data-close="departure-dialog"]');}
const stored=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE);
const own=p=>p.evaluate(()=>__widewake.session.writable);
async function claim(p){await focus(p);await p.click('#continue-voyage');await p.waitForFunction(()=>__widewake.session.owner&&!__widewake.atTitle);}
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  browser=process.env.WIDEWAKE_TEST_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:process.env.WIDEWAKE_TEST_BROWSER||'/Users/ethan/.local/bin/agent-chrome-for-testing'});
  {
    const c=await browser.newContext(),a=await boot(c);await fresh(a);await a.click('[data-action="buy"][data-id="sugar"]');const b=await boot(c);
    assert.equal(await own(a),true);assert.equal(await own(b),false);assert.equal(await b.evaluate(()=>__widewake.game.quantity('sugar')),17);assert.match(await b.innerText('#continue-voyage'),/Continue here/);
    await focus(a);await a.click('[data-action="buy"][data-id="sugar"]');assert.equal((await stored(a)).cargo.sugar,22);
    await b.goto('about:blank');assert.equal((await stored(a)).cargo.sugar,22,'Leaving an older window must not roll back the fleet.');await b.goBack();await b.waitForFunction(()=>window.__widewake);await claim(b);
    assert.equal((await stored(b)).cargo.sugar,22);assert.equal(await own(a),false);assert.equal(await a.evaluate(()=>__widewake.atTitle&&__widewake.game.paused),true);
    await b.click('[data-action="buy"][data-id="sugar"]');const latest=await stored(b);
    await focus(a);await a.click('#title-settings');await a.uncheck('#sound-enabled');await a.click('[data-close="settings-dialog"]');assert.deepEqual(await stored(a),latest,'A spectator preference must not save its stale fleet.');await claim(a);assert.equal(await a.evaluate(()=>__widewake.game.quantity('sugar')),27);assert.equal(await a.evaluate(()=>__widewake.game.s.settings.sound),false);
    await b.close();assert.equal((await stored(a)).cargo.sugar,27);await c.close();check('stale close, back navigation, explicit two-way handoff and spectator settings');
  }
  for(const kind of ['battle','fishing','oil']){
    let game;if(kind==='battle')game=boss('iron-king');else{game=make();place(game,game.sites.find(s=>s.type===(kind==='fishing'?'fish':'oil')));assert.ok(game.startProduction());for(let i=0;i<240;i++)game.step(1/60);}
    const fixture=game.snapshot();fixture.settings.sound=false;
    const c=await browser.newContext(),a=await boot(c);await a.evaluate(state=>{__widewake.setState(state);__widewake.game.paused=true;__widewake.save();},fixture);const expected=await stored(a),b=await boot(c);
    await claim(b);assert.deepEqual(await stored(b),expected,kind+' first handoff save retains the entire sea');assert.equal(await own(a),false);await b.click('#sea-pause');await b.click('#return-title');const paused=await b.evaluate(()=>__widewake.game.snapshot());await a.goto('about:blank');assert.deepEqual(await stored(b),paused);await c.close();check(kind+' handoff preserves attackers, momentum, loot, work and campaign');
  }
  {
    const c=await browser.newContext(),a=await boot(c);await fresh(a);const b=await boot(c);await focus(a);
    await a.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='widewake-save-v2')throw new DOMException('Full','QuotaExceededError');return originalSet.call(this,key,value);};});
    await a.click('[data-action="buy"][data-id="sugar"]');await focus(b);await b.click('#continue-voyage');await b.waitForFunction(()=>document.getElementById('title-storage').textContent.includes('could not save'));
    assert.equal(await own(a),true);assert.equal(await own(b),false);assert.equal(await b.evaluate(()=>__widewake.atTitle),true);assert.equal(await a.evaluate(()=>__widewake.game.quantity('sugar')),17);assert.equal((await stored(a)).cargo.sugar,12);
    await focus(a);await a.click('#settings-open');const downloadEvent=a.waitForEvent('download');await a.click('#export-save');const download=await downloadEvent,file=path.join(out,'unsaved-fleet.json');await download.saveAs(file);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).cargo.sugar,17);
    await a.evaluate(()=>{Storage.prototype.setItem=originalSet;});await claim(b);assert.equal((await stored(b)).cargo.sugar,17);await c.close();check('failed primary denies handoff, preserves live progress, supports export and retries');
  }
  {
    const c=await browser.newContext(),a=await boot(c);await fresh(a);const b=await boot(c),d=await boot(c);await focus(b);await focus(d);
    // Start competing requests without serializing their responses. Both are visible
    // test pages; the exclusive browser lock, not a timer, must choose the writer.
    await Promise.all([b.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.claimResult=__widewake.session.request();}),d.evaluate(()=>{window.dispatchEvent(new Event('focus'));window.claimResult=__widewake.session.request();})]);
    const results=await Promise.all([b.evaluate(()=>claimResult),d.evaluate(()=>claimResult)]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(Number(await own(a))+Number(await own(b))+Number(await own(d)),1);await c.close();check('simultaneous requests have exactly one writer');
  }
  {
    const c=await browser.newContext(),a=await boot(c);await fresh(a);await a.click('[data-action="buy"][data-id="sugar"]');const b=await boot(c);await a.close();await claim(b);assert.equal((await stored(b)).cargo.sugar,17);
    await b.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));const d=await boot(c);await claim(d);await d.click('[data-action="buy"][data-id="sugar"]');
    await b.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await b.waitForFunction(()=>__widewake.atTitle&&__widewake.game.quantity('sugar')===22);assert.equal(await own(b),false);assert.equal(await b.evaluate(()=>__widewake.game.paused),true);assert.equal((await stored(b)).cargo.sugar,22);await c.close();check('closed owner and restored page retain latest progress and pause');
  }
  {
    const fixture=dense().snapshot(),text=JSON.stringify(fixture),c=await browser.newContext();await c.addInitScript(text=>{if(!localStorage.getItem('seeded')){localStorage.setItem('widewake-save-v1',text);localStorage.setItem('widewake-save-backup-v1',text);localStorage.setItem('seeded','1');}},text);const p=await boot(c);
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),SAVE),null);await p.evaluate(()=>{document.getElementById('continue-voyage').click();__widewake.game.paused=true;});assert.deepEqual(await stored(p),fixture);assert.equal(await p.evaluate(()=>localStorage.getItem('widewake-save-v1')),null);
    const old=await c.newPage();await old.goto(base+'/favicon.svg');await old.evaluate(()=>localStorage.setItem('widewake-save-v1','{"version":1,"coins":1}'));assert.deepEqual(await stored(p),fixture);assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),BACKUP),fixture);await c.close();check('dense legacy migration and an old client cannot overwrite the new fleet');
  }
  {
    const c=await browser.newContext();await c.addInitScript(()=>{window.BroadcastChannel=undefined;});const a=await boot(c);await fresh(a);const imported=new C.Game(earth,await stored(a)).snapshot(),b=await boot(c);
    await b.click('#title-settings');await b.click('#import-save');await b.waitForFunction(()=>document.getElementById('save-message').textContent.includes('Ready here'));
    assert.equal(await own(b),true);assert.equal(await own(a),false);await b.setInputFiles('#save-file',{name:'captain.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});await b.waitForFunction(()=>document.getElementById('save-message').textContent.includes('Fleet restored'));assert.deepEqual(await stored(b),imported);await b.click('[data-close="settings-dialog"]');await claim(a);
    await focus(b);await b.click('#start-voyage');await b.waitForFunction(()=>document.getElementById('reset-dialog').open);assert.equal(await own(b),true);await claim(a);assert.equal(await b.locator('#reset-dialog').isVisible(),false);assert.deepEqual(await stored(a),imported,'A stale restart confirmation closes when another window takes over.');
    await focus(b);await b.click('#title-settings');await b.setInputFiles('#save-file',{name:'late-file.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});await b.waitForFunction(()=>document.getElementById('save-message').textContent.includes('Continue here'));assert.equal(await own(b),false);assert.deepEqual(await stored(b),imported);
    await c.close();check('storage-event handoff, import ownership and revoked restart confirmation');
  }
  {
    const c=await browser.newContext(),a=await boot(c);await fresh(a);const b=await boot(c);await b.evaluate(()=>{document.getElementById('continue-voyage').click();window.dispatchEvent(new Event('blur'));});await b.waitForFunction(()=>document.getElementById('title-storage').textContent.includes('Return here'));
    assert.equal(await b.evaluate(()=>__widewake.atTitle&&__widewake.game.paused),true);assert.equal(await own(b),false);await claim(b);await c.close();check('leaving during a handoff cannot silently resume the voyage');
  }
  {
    const c=await browser.newContext(),a=await boot(c);await fresh(a);const b=await boot(c);await focus(a);
    await a.evaluate(()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='widewake-save-v2')throw new DOMException('Full','QuotaExceededError');return originalSet.call(this,key,value);};});await a.click('[data-action="buy"][data-id="sugar"]');await a.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    await claim(b);await b.click('[data-action="buy"][data-id="sugar"]');await b.click('[data-action="buy"][data-id="sugar"]');await a.evaluate(()=>{Storage.prototype.setItem=originalSet;window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await a.waitForFunction(()=>__widewake.atTitle&&__widewake.session.localOnly);
    assert.equal(await a.evaluate(()=>__widewake.game.quantity('sugar')),17);assert.equal((await stored(a)).cargo.sugar,22);assert.equal(await own(a),false);assert.equal(await own(b),true);await focus(a);await a.click('#continue-voyage');assert.equal(await a.evaluate(()=>__widewake.game.quantity('sugar')),17);assert.equal((await stored(a)).cargo.sugar,22);await c.close();check('an unsaved restored page keeps its live fleet for export without overwriting newer progress');
  }
  {
    const c=await browser.newContext(),seed=make().snapshot();seed.atSea=false;seed.location=null;seed.sea=null;const p=await c.newPage();await p.goto(base+'/favicon.svg');await p.evaluate(text=>localStorage.setItem('widewake-save-v1',text),JSON.stringify(seed));await p.goto(base+'/widewake.html?test');await p.waitForFunction(()=>window.__widewake);await p.goto('about:blank');await p.goBack();await p.waitForFunction(()=>window.__widewake);assert.equal(await p.evaluate(key=>localStorage.getItem(key),SAVE),null,'Visiting and leaving the legacy title must not create a new fleet generation.');
    const newer=structuredClone(seed);newer.coins+=321;await p.evaluate(text=>localStorage.setItem('widewake-save-v1',text),JSON.stringify(newer));await focus(p);await p.click('#continue-voyage');assert.equal((await stored(p)).coins,newer.coins);await c.close();check('legacy title stays read-only until play and takes the latest old-version fleet');
  }
  {
    const c=await browser.newContext(),old=make().snapshot(),replacement=boss('widow').snapshot();await c.addInitScript(text=>{if(!localStorage.getItem('widewake-save-v2'))localStorage.setItem('widewake-save-v1',text);},JSON.stringify(old));const p=await boot(c);await p.click('#title-settings');await p.setInputFiles('#save-file',{name:'new-fleet.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(replacement))});await p.waitForFunction(()=>document.getElementById('save-message').textContent.includes('Fleet restored'));assert.deepEqual(await stored(p),replacement);await c.close();check('importing from the legacy title persists the imported fleet');
  }
  for(const unsupported of ['missing','rejected']){
    const c=await browser.newContext();await c.addInitScript(kind=>{if(kind==='missing')Object.defineProperty(navigator,'locks',{value:undefined});else navigator.locks.request=()=>Promise.reject(new DOMException('Denied','SecurityError'));},unsupported);const p=await boot(c);assert.match(await p.innerText('#title-storage'),/Autosave is unavailable/);await fresh(p);await p.click('[data-action="buy"][data-id="sugar"]');assert.equal(await p.evaluate(key=>localStorage.getItem(key),SAVE),null);await p.click('#settings-open');assert.equal(await p.locator('#export-save').isEnabled(),true);assert.match(await p.innerText('#save-message'),/Autosave is unavailable/);await c.close();check(unsupported+' lock API permits local play and export without unsafe device writes');
  }
  for(const [name,width,height]of [['portrait',360,640],['landscape',667,375]]){
    const c=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true}),a=await boot(c);await fresh(a);const b=await boot(c);await b.screenshot({path:path.join(out,name+'-handoff.png')});
    assert.ok(await b.evaluate(()=>{const menu=document.querySelector('.ww-title-menu').getBoundingClientRect(),footer=document.querySelector('.ww-title-footer').getBoundingClientRect();return document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1&&menu.bottom<=footer.top&&document.getElementById('title-storage').getBoundingClientRect().bottom<=menu.bottom;}),name+' handoff notice must not overlap footer');await claim(b);await c.close();check(name+' handoff is visible and usable');
  }
  assert.deepEqual(errors,[]);check('no uncaught browser errors');console.log('Screenshots: '+out);
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
