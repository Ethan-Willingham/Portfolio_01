/* Saving is parked: live sessions survive menus, never reloads or other tabs. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||'/tmp/widewake-session-controls';
require('../../js/widewake-battle-core.js');require('../../js/widewake-estuary-core.js');const R=require('../../js/widewake-reach-game.js');
const previous=new R.Game();previous.coins=9876;const seed={'widewake-reach-v1':previous.save(),'widewake-reach-backup-v1':'{damaged backup','widewake-save-v2':'previous world','widewake-save-v1':'oldest world'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':data);});});
let browser;const errors=[];const ready=p=>p.waitForFunction(()=>__widewakeReach.view?.terrain.ready,null,{timeout:45000});
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/widewake.html?test';
  browser=await(process.env.WIDEWAKE_TEST_ENGINE==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'}));
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(seed=>{
    for(const [key,value]of Object.entries(seed))localStorage.setItem(key,value);
    const get=Storage.prototype.getItem;window.storageSnapshot=()=>Object.fromEntries(Object.keys(seed).map(k=>[k,get.call(localStorage,k)]));window.saveAccess=[];
    for(const method of ['getItem','setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(key,...args){if(this===localStorage&&(method==='clear'||key!=='widewake-reach-settings')){window.saveAccess.push([method,key]);throw Error('Campaign storage must stay disabled');}return original.call(this,key,...args);};}
  },seed);
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);
  assert.equal(await p.locator('#continue-voyage,#title-save,#title-storage,#saves-fold,#export-save,#import-save,#import-file,#legacy-export,#import-dialog,#reverse,#tow').count(),0);
  assert.equal(await p.locator('#resume-voyage').isVisible(),false);assert.equal(await p.evaluate(()=>typeof WidewakeSaves),'undefined');await p.screenshot({path:path.join(out,'title.png')});
  await p.click('#start-voyage');await ready(p);assert.equal(await p.evaluate(()=>__widewakeReach.game.coins),520);
  await p.click('[data-service="trade"]');await p.click('[data-trade="buy"]');await p.click('[data-close="port-service"]');const coins=await p.evaluate(()=>__widewakeReach.game.coins);assert.ok(coins<520);
  await p.click('#reach-pause');await p.screenshot({path:path.join(out,'pause.png')});await p.click('#return-title');assert.equal(await p.locator('#resume-voyage').isVisible(),true);
  await p.click('#start-voyage');await p.click('[data-close="new-dialog"]');await p.click('#resume-voyage');await ready(p);assert.equal(await p.evaluate(()=>__widewakeReach.game.coins),coins);
  // A second tab starts its own voyage and cannot take away the first one's state.
  const other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));await other.goto(url);await other.click('#start-voyage');await ready(other);assert.equal(await other.evaluate(()=>__widewakeReach.game.coins),520);assert.equal(await p.evaluate(()=>__widewakeReach.game.coins),coins);assert.deepEqual(await other.evaluate(()=>saveAccess),[]);await other.close();await p.bringToFront();
  await p.click('#cast-off');await p.evaluate(()=>{const g=__widewakeReach.game;Object.assign(g.player,{x:0,y:2000,px:0,py:2000,angle:0,vx:0,vy:0,throttle:0});g.nextEncounter=1e9;});
  await p.keyboard.down('r');await p.waitForTimeout(300);await p.keyboard.up('r');assert.equal(await p.evaluate(()=>__widewakeReach.game.player.throttle),0);assert.equal(await p.evaluate(()=>typeof __widewakeReach.game.tow),'undefined');
  await p.evaluate(()=>{window.testPad={connected:true,index:0,mapping:'standard',id:'Test controller',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};navigator.getGamepads=()=>[testPad];});await p.waitForTimeout(100);await p.evaluate(()=>testPad.buttons[7]={pressed:true,value:1});await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>__widewakeReach.game.player.throttle),0);await p.evaluate(()=>testPad.buttons[7]={pressed:false,value:0});
  await p.keyboard.down('w');await p.waitForTimeout(600);await p.keyboard.up('w');assert.ok(await p.evaluate(()=>__widewakeReach.game.player.throttle)>0);
  // Cross the old autosave interval while the actual game loop is running.
  await p.waitForTimeout(16000);await p.click('#reach-pause');await p.click('#return-title');await p.click('#start-voyage');await p.click('#confirm-new');await ready(p);assert.equal(await p.evaluate(()=>__widewakeReach.game.coins),520);
  assert.deepEqual(await p.evaluate(()=>saveAccess),[]);assert.deepEqual(await p.evaluate(()=>storageSnapshot()),seed);
  await p.reload();assert.equal(await p.locator('#resume-voyage').isVisible(),false);await p.click('#start-voyage');await ready(p);assert.equal(await p.evaluate(()=>__widewakeReach.game.coins),520);assert.deepEqual(await p.evaluate(()=>saveAccess),[]);assert.deepEqual(await p.evaluate(()=>storageSnapshot()),seed);await context.close();
  // Storage can be unavailable altogether without blocking new play or settings.
  const blocked=await browser.newContext();await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Unavailable','SecurityError');}}));const q=await blocked.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(url);await q.click('#title-settings');await q.uncheck('#sound-enabled');await q.click('#reach-resume');await q.click('#start-voyage');await ready(q);assert.equal(await q.evaluate(()=>__widewakeReach.game.coins),520);await blocked.close();
  assert.deepEqual(errors,[]);console.log('PASS no save reads/writes, untouched old saves, independent tabs, session resume, fresh reloads, unavailable storage, and removed reverse/tow controls');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
