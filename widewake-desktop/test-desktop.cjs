const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {_electron:electron}=require('playwright');
const {spawn}=require('node:child_process');
const {boss,dense}=require('../tools/widewake/sea-fixtures.cjs');
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(__dirname,'test-output');
let app,profile;const errors=[],requests=[];
const check=text=>console.log('PASS '+text);
async function launch(){
  const packaged=process.env.WIDEWAKE_DESKTOP_EXECUTABLE;
  app=await electron.launch({executablePath:packaged||require('electron'),args:[...(!packaged?[path.join(__dirname,'stage')]:[]),'--profile='+profile,'--test'],timeout:30000});
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.waitForFunction(()=>window.__widewake&&!document.getElementById('loading').checkVisibility());
  await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].focus();});await page.bringToFront();return page;
}
async function close(){if(app){const owned=app;app=null;await owned.close();}}
(async()=>{try{
  await fs.mkdir(out,{recursive:true});profile=await fs.mkdtemp(path.join(os.tmpdir(),'widewake-native-profile-'));
  let p=await launch();
  assert.match(await p.innerText('#title-version'),/Desktop edition/);assert.ok(await p.locator('#title-quit').isVisible());
  assert.equal(await p.evaluate(()=>localStorage.getItem('widewake-save-v2')),null);
  const runtime=await app.evaluate(({app,BrowserWindow})=>({version:process.versions.electron,platform:process.platform,arch:process.arch,packaged:app.isPackaged,name:app.getName(),profile:app.getPath('userData'),prefs:BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()}));
  assert.equal(runtime.name,'Widewake');assert.equal(runtime.profile,profile);assert.equal(runtime.packaged,!!process.env.WIDEWAKE_DESKTOP_EXECUTABLE);
  assert.equal(runtime.prefs.nodeIntegration,false);assert.equal(runtime.prefs.contextIsolation,true);assert.equal(runtime.prefs.sandbox,true);
  assert.deepEqual(await p.evaluate(()=>[typeof require,typeof process,typeof WidewakeDesktop.importSave,Object.isFrozen(WidewakeDesktop)]),['undefined','undefined','function',true]);
  const second=spawn(process.env.WIDEWAKE_DESKTOP_EXECUTABLE||require('electron'),[...(!process.env.WIDEWAKE_DESKTOP_EXECUTABLE?[path.join(__dirname,'stage')]:[]),'--profile='+profile],{stdio:'ignore'});
  let timer;try{const code=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Second instance did not release the profile')),5000);second.once('error',reject);second.once('exit',resolve);});assert.equal(code,0);}finally{clearTimeout(timer);if(second.exitCode===null)second.kill('SIGTERM');}
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  const forbidden=await p.evaluate(async()=>{const result=[];for(const url of ['widewake://game/main.cjs','widewake://game/%2e%2e%2fpackage.json','widewake://other/widewake.html','https://example.com/']){try{const r=await fetch(url);result.push(r.ok);}catch{result.push(false);}}return result;});assert.deepEqual(forbidden,[false,false,false,false]);
  await p.click('#title-fullscreen');await p.waitForFunction(()=>document.getElementById('title-fullscreen').textContent==='Leave full screen');
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen()),true);await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({type:'keyDown',keyCode:'F11'});});await p.waitForFunction(()=>document.getElementById('title-fullscreen').textContent==='Full screen');await p.waitForFunction(()=>__widewake.activity.active());
  await p.screenshot({path:path.join(out,'desktop-title.png')});
  check('offline title, single profile owner, isolated renderer, bundled-resource boundary and full screen');

  await app.evaluate(({app,BrowserWindow})=>{app.focus({steal:true});BrowserWindow.getAllWindows()[0].focus();});await p.click('#start-voyage');await p.click('[data-close="departure-dialog"]');await p.click('[data-action="buy"][data-id="sugar"]');
  const initial=await p.evaluate(()=>({coins:__widewake.game.s.coins,sugar:__widewake.game.quantity('sugar')}));
  assert.equal(initial.sugar,17);await p.click('#settings-open');
  const exported=path.join(out,'exported-fleet.json');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exported);
  await p.click('#export-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent.startsWith('Saved exported-fleet.json'));
  const portable=JSON.parse(await fs.readFile(exported,'utf8'));assert.equal(portable.coins,initial.coins);assert.equal(portable.cargo.sugar,17);
  await app.evaluate(({dialog})=>{dialog.showSaveDialog=async()=>({canceled:true});});await p.click('#export-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent==='Export canceled.');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},path.join(out,'missing-parent','fleet.json'));await p.click('#export-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent.startsWith('Export failed:'));
  const bad=path.join(out,'bad-fleet.json');await fs.writeFile(bad,'{"version":1,"coins":999999}');
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},bad);await p.click('#import-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent.startsWith('Import failed:'));assert.equal(await p.evaluate(()=>__widewake.game.s.coins),initial.coins);
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});await p.click('#import-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent==='Import canceled.');
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},exported);await p.click('#import-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent.startsWith('Fleet restored from exported-fleet.json'));assert.equal(await p.evaluate(()=>__widewake.game.s.coins),initial.coins);
  check('native export, cancellation, write failure, rejected malformed import and portable fleet restore');

  await p.click('#settings-return');await p.click('#harbor-chart');await p.selectOption('#destination-list','nassau');await p.waitForFunction(()=>!document.getElementById('plot-course').disabled);assert.ok(await p.evaluate(()=>__widewake.chartRoute.path.length>0));await p.click('#plot-course');
  await p.keyboard.press('h');assert.equal(await p.evaluate(()=>__widewake.game.autopilot),false);await p.keyboard.press('h');await p.waitForFunction(()=>__widewake.game.autopilot);assert.equal(await p.locator('#chart-dialog').isVisible(),false);check('native H takes and returns the helm through the bundled route worker');
  await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].minimize();});await new Promise(r=>setTimeout(r,300));console.log('Minimize state',JSON.stringify({window:await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];return{minimized:w.isMinimized(),focused:w.isFocused(),visible:w.isVisible()};}),game:await p.evaluate(()=>({paused:__widewake.game.paused,active:__widewake.activity.active(),hidden:document.hidden,focused:document.hasFocus()}))}));await p.waitForFunction(()=>__widewake.game.paused,null,{polling:100,timeout:5000});
  const frozen=await p.evaluate(()=>({seconds:__widewake.game.s.seconds,polls:__widewake.controller.polls}));assert.equal(await p.evaluate(()=>__widewake.activity.active()),false);await new Promise(r=>setTimeout(r,160));assert.deepEqual(await p.evaluate(()=>({seconds:__widewake.game.s.seconds,polls:__widewake.controller.polls})),frozen);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.restore();w.focus();});await p.bringToFront();assert.equal(await p.evaluate(()=>__widewake.game.paused),true);await p.click('#settings-return');
  await app.evaluate(({powerMonitor})=>{powerMonitor.emit('suspend');});await p.waitForFunction(()=>__widewake.game.paused,null,{polling:100});assert.equal(await p.evaluate(()=>__widewake.activity.active()),false);
  await app.evaluate(({powerMonitor})=>{powerMonitor.emit('resume');});assert.equal(await p.evaluate(()=>__widewake.game.paused),true);await p.click('#settings-return');
  await p.evaluate(()=>{const g=__widewake.game,port=g.ports.find(p=>p.id==='nassau');for(let i=0;i<180*60&&WidewakeWorld.distance(g.player,port)>160;i++)g.step(1/60,{});__widewake.render();});await p.click('#context-action');
  assert.equal(await p.evaluate(()=>__widewake.game.s.port),'nassau');for(let i=0;i<3;i++)await p.click('[data-action="sell"][data-id="sugar"]');
  await p.click('[data-tab="fleet"]');await p.click('[data-action="boat"][data-id="trawler"]');assert.ok(await p.evaluate(()=>__widewake.game.fleet.some(f=>f.type==='trawler')));
  await p.click('#harbor-chart');await p.selectOption('#destination-list','bahama-bank');await p.waitForFunction(()=>!document.getElementById('plot-course').disabled);await p.click('#plot-course');
  await p.evaluate(()=>{const g=__widewake.game,site=g.sites.find(s=>s.id==='bahama-bank');for(let i=0;i<180*60&&WidewakeWorld.distance(g.player,site)>120;i++)g.step(1/60,{});__widewake.render();});await p.click('#context-action');
  assert.equal(await p.evaluate(()=>__widewake.game.production?.site.id),'bahama-bank');await p.evaluate(()=>__widewake.step(16));
  await p.screenshot({path:path.join(out,'desktop-working-watch.png')});
  const before=await p.evaluate(()=>{__widewake.game.paused=true;return{coins:__widewake.game.s.coins,fish:__widewake.game.quantity('fish'),seconds:__widewake.game.s.seconds,progress:__widewake.game.production.progress};});assert.ok(before.fish>0);
  // Close the OS window, without the pause menu or a scheduled automatic save.
  const closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();});await closed;app=null;
  p=await launch();assert.ok(await p.locator('#continue-voyage').isVisible());const resumed=await p.evaluate(()=>({coins:__widewake.game.s.coins,fish:__widewake.game.quantity('fish'),seconds:__widewake.game.s.seconds,progress:__widewake.game.production.progress}));assert.deepEqual(resumed,before);
  await p.click('#continue-voyage');assert.equal(await p.evaluate(()=>__widewake.game.production.site.id),'bahama-bank');
  check('earned first trade, purchased trawler, offline route worker, protected fishing and exact OS-close continuation');

  await p.click('#sea-pause');const earnedWatch=await p.evaluate(()=>__widewake.game.snapshot());
  for(const [name,fixture]of [['admiral',boss('iron-king').snapshot()],['dense-battle',dense().snapshot()]]){
    const file=path.join(out,name+'-import.json');fixture.settings.sound=false;await fs.writeFile(file,JSON.stringify(fixture));
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);await p.click('#import-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent.startsWith('Fleet restored'));
    const expected=await p.evaluate(()=>__widewake.game.snapshot());assert.equal(expected.sea.version,1);
    const exportFile=path.join(out,name+'-export.json');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exportFile);await p.click('#export-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent.startsWith('Saved '));assert.deepEqual(JSON.parse(await fs.readFile(exportFile,'utf8')),expected);
    if(name==='dense-battle')assert.ok((await fs.stat(exportFile)).size>500000);
    const exiting=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].close();});await exiting;app=null;p=await launch();
    assert.equal(await p.evaluate(()=>__widewake.game.paused),true);assert.deepEqual(await p.evaluate(()=>__widewake.game.snapshot()),expected);await p.click('#title-settings');
  }
  const earnedFile=path.join(out,'earned-watch.json');await fs.writeFile(earnedFile,JSON.stringify(earnedWatch));await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},earnedFile);await p.click('#import-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent.startsWith('Fleet restored'));assert.deepEqual(await p.evaluate(()=>__widewake.game.snapshot()),earnedWatch);
  await p.click('#settings-return');await p.click('#continue-voyage');
  check('native files and OS-close continuation preserve an admiral attack and the maximum active sea');

  await app.evaluate(({dialog})=>{globalThis.closeWarnings=[];dialog.showMessageBox=async(_win,options)=>{closeWarnings.push(options.title);return{response:0};};});
  await p.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('Unavailable','QuotaExceededError');};});
  await p.click('#sea-pause');await p.click('#quit-game');
  await p.waitForFunction(()=>document.getElementById('save-status').textContent.includes('Export'));
  await new Promise(r=>setTimeout(r,150));assert.deepEqual(await app.evaluate(()=>closeWarnings),['The fleet could not be saved']);assert.ok(await p.locator('#settings-dialog').isVisible());assert.equal(await p.evaluate(()=>__widewake.game.paused),true);
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},path.join(out,'emergency-export.json'));await p.click('#export-save');await p.waitForFunction(()=>document.getElementById('save-message').textContent.startsWith('Saved emergency-export.json'));
  assert.ok(JSON.parse(await fs.readFile(path.join(out,'emergency-export.json'),'utf8')).production);
  await p.evaluate(()=>{Storage.prototype.setItem=originalSetItem;delete originalSetItem;});
  const normalRequests=requests.filter(url=>!['https://example.com/','widewake://game/main.cjs','widewake://game/%2e%2e%2fpackage.json','widewake://other/widewake.html'].includes(url));assert.ok(normalRequests.every(url=>url.startsWith('widewake://game/')||url.startsWith('data:')));
  await p.screenshot({path:path.join(out,'desktop-pause.png')});assert.deepEqual(errors,[]);
  const quit=app.waitForEvent('close');await p.click('#quit-game');await quit;app=null;
  check('failed save keeps the window and fleet open; explicit quit flushes progress without background work');
  delete runtime.prefs;await fs.writeFile(path.join(out,'runtime.json'),JSON.stringify(runtime,null,2));console.log('Desktop checks complete: '+JSON.stringify(runtime));
}finally{await close();if(profile)await fs.rm(profile,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
