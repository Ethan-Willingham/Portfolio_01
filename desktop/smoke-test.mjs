import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const {_electron}=await import(process.env.PLAYWRIGHT_MODULE);
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sluice-desktop-qa-'));
const app=await _electron.launch({executablePath:path.join(here,'dist/Sluice-win32-x64/Sluice.exe'),args:['--profile='+profile],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined},timeout:30000});
let page;const errors=[],remote=[],failed=[],consoleErrors=[];
try{
  page=await app.firstWindow();page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url());});page.on('requestfailed',r=>failed.push(r.url()));
  await page.waitForFunction(()=>window.SluiceLoading&&!SluiceLoading.active(),undefined,{timeout:60000});
  const initial=await page.evaluate(async()=>({url:location.href,secure:isSecureContext,node:typeof require,fonts:document.fonts.check('12px Commit Mono'),canvas:[document.getElementById('game-canvas').width,document.getElementById('game-canvas').height],gpu:!!navigator.gpu,controls:document.querySelectorAll('#game-pause').length,body:document.querySelectorAll('.post-header,.game-about,.site-footer').length,moon:(await fetch('assets/images/moon.jpg')).status}));
  assert.equal(initial.url,'sluice://app/grand-motherload.html');assert(initial.secure&&initial.gpu);assert.equal(initial.node,'undefined');assert.equal(initial.controls,1);assert.equal(initial.body,0);assert.equal(initial.moon,200);
  assert.equal(await page.evaluate(()=>gm.get('perf.mountainGPU')),1);
  await page.evaluate(()=>{SluiceOptions.set('musicvol',.37);});await page.reload();
  await page.waitForFunction(()=>window.SluiceLoading&&!SluiceLoading.active(),undefined,{timeout:60000});
  assert.equal(await page.evaluate(()=>SluiceOptions.get('musicvol')),'0.37','Options survive reload');
  const security=await app.evaluate(({BrowserWindow,app})=>{const w=BrowserWindow.getAllWindows()[0],prefs=w.webContents.getLastWebPreferences();return {packaged:app.isPackaged,sandbox:prefs.sandbox,node:prefs.nodeIntegration,isolation:prefs.contextIsolation,fullscreen:w.isFullScreen()};});
  assert(security.packaged&&security.sandbox&&security.isolation&&!security.node);
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});
  // CDP key injection bypasses Electron's native before-input-event handler.
  async function fullscreen(expected){await app.evaluate(({BrowserWindow})=>{const wc=BrowserWindow.getAllWindows()[0].webContents;wc.sendInputEvent({type:'keyDown',keyCode:'F11'});wc.sendInputEvent({type:'keyUp',keyCode:'F11'});});for(let i=0;i<30;i++){if(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())===expected)return;await page.waitForTimeout(100);}throw Error('F11 fullscreen did not reach '+expected);}
  await fullscreen(true);await fullscreen(false);
  // These three event cues are deliberately absent in the shared audio manifest.
  const missingEvent=/\/assets\/music\/event-(bigstrike|arrival|ui)\.m4a$/;
  assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);assert.deepEqual(failed.filter(url=>!missingEvent.test(url)),[]);
  console.log('PASS packaged offline boot, local assets, persistent options, sandbox and fullscreen '+JSON.stringify({initial,security}));
}catch(error){console.error(JSON.stringify({errors,remote,failed,consoleErrors,state:await page?.evaluate(()=>({url:location.href,loading:document.getElementById('game-intro')?.dataset,state:document.body.innerText.slice(0,1000),gm:typeof gm}))}));if(page)await page.screenshot({path:profile+'.png'});throw error;
}finally{await app.close();assert.equal(path.dirname(profile),os.tmpdir());fs.rmSync(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
