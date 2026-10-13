import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'wss-network-browser-'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer((req,res)=>{try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let ws,seq=0;const pending=new Map(),errors=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
async function until(expression,ms=60000){const end=Date.now()+ms;while(!await ev(expression)){if(Date.now()>end)throw Error('Timed out: '+expression+'; state='+JSON.stringify(await ev('({toy:!!window.__toy,stats:window.__toy?.stats(),error:window.__toy?.buildState()?.error,body:document.body?.textContent?.slice(0,300)})'))+'; errors='+JSON.stringify(errors.slice(0,3)));await pause(100);}}
try{
 const portFile=path.join(profile,'DevToolsActivePort'),end=Date.now()+30000;while(!fs.existsSync(portFile)){if(chrome.exitCode!==null||Date.now()>end)throw Error('Chrome launch failed');await pause(50);}
 const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]),tabs=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result);}}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);});
 await send('Runtime.enable');await send('Page.enable');await send('Page.bringToFront');await send('Emulation.setDeviceMetricsOverride',{width:1180,height:780,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=cup-synchronization`});
 await until('!!window.__toy&&!__toy.stats().loading&&__toy.machineState()?.ready');
 const ids=await ev('window.WSSNetworkMachines.ids');
 for(const id of ids){
  if(id!==ids[0]){await ev(`__toy.machine(${JSON.stringify(id)},{})`);await until(`__toy.stats().scene===${JSON.stringify(id)}&&!__toy.stats().loading&&__toy.machineState()?.ready`);}
  const result=await ev(`(()=>{let r=__toy.runtime(),s=r&&r.stats(),c=__toy.machineControls();return{scene:__toy.stats().scene,reduced:__toy.stats().reducedModel,model:s&&s.model,finite:s&&s.finite,massError:s&&s.massError,controls:c.map(x=>x.id),action:document.querySelector('.toy-scene-action[data-control="primary"]')?.hidden===false,error:__toy.machineState()?.readings?.error||null}})()`);
  assert.equal(result.scene,id);assert.equal(result.reduced,true);assert.equal(result.model,'finite hydraulic network');assert.equal(result.finite,true);assert(Math.abs(result.massError)<1e-5);assert(result.controls.includes('primary'));assert.equal(result.error,null);assert.equal(result.action,true,'visible primary action '+id);
  const before=await ev('__toy.runtime().stats().events');
  await ev('document.querySelector(\'.toy-scene-action[data-control="primary"]\').click()');await pause(100);
  assert.equal(await ev('__toy.runtime().stats().finite'),true);
  assert((await ev('__toy.runtime().stats().events'))>before,'primary click acted on '+id);
  if(process.env.WSS_SCREENSHOT_DIR&&['cup-synchronization','fountain-music','bottle-glass-pitch'].includes(id)){
   await pause(500);assert((await ev('__toy.runtime().clock()'))>.05,'active browser advances '+id);
   fs.mkdirSync(process.env.WSS_SCREENSHOT_DIR,{recursive:true});const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(process.env.WSS_SCREENSHOT_DIR,id+'.png'),Buffer.from(shot.data,'base64'));
  }
  process.stdout.write('PASS browser '+id+'\n');
 }
 await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=cup-synchronization`});
 await until('!!window.__toy&&!__toy.stats().loading&&__toy.machineState()?.ready');
 for(const id of ids){
  if(id!==ids[0]){await ev(`__toy.machine(${JSON.stringify(id)},{})`);await until(`__toy.stats().scene===${JSON.stringify(id)}&&!__toy.stats().loading&&__toy.machineState()?.ready`);}
  const action=await ev('(()=>{const b=document.querySelector(\'.toy-scene-action[data-control="primary"]\'),r=b?.getBoundingClientRect();return b&&!b.hidden&&!b.disabled&&r&&r.width>=44&&r.height>=44?{x:r.x+r.width/2,y:r.y+r.height/2}:null})()');
  assert(action,'landscape touch control '+id);
  if(id===ids[0]){const before=await ev('__toy.runtime().stats().events');await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:action.x,y:action.y,id:1,radiusX:7,radiusY:7,force:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert((await ev('__toy.runtime().stats().events'))>before,'landscape touch action');}
 }
 process.stdout.write('PASS landscape controls for '+ids.length+' network scenes\n');
 assert.equal(errors.length,0,JSON.stringify(errors));
}finally{
 for(const p of pending.values())clearTimeout(p.timer);ws?.close();
 if(chrome.exitCode===null&&chrome.signalCode===null){const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);}
 await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
