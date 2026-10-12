import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Real pointer and keyboard actions against the live WebGPU demo.
// Run: node tools/test-water-demo-actions.mjs
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'wss-direct-actions-'));
const errors=[];
const server=createServer((req,res)=>{try{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 let data=fs.readFileSync(file);
 if(file.endsWith('/js/water-smoke-slime.js')){const source=data.toString(),end=source.lastIndexOf('})();');data=Buffer.from(source.slice(0,end)+'window.__wssInteractionTest=function(source){return eval(source);};\n'+source.slice(end));}
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);
}catch(error){res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
let ws,seq=0;const pending=new Map();
function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},45000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function ev(expression){let r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;}
const sim=source=>ev(`__wssInteractionTest(${JSON.stringify(source)})`);
async function until(expr,ms=45000){const end=Date.now()+ms;while(!await ev(expr)){if(Date.now()>end)throw Error('Timed out: '+expr);await pause(50);}}
async function mouse(type,x,y,extra={}){await send('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',clickCount:1,...extra});}
async function target(id='primary'){return ev(`(()=>{let b=document.querySelector('.toy-scene-action[data-control="${id}"]'),r=b?.getBoundingClientRect();return b&&!b.hidden&&r?{x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}:null})()`);}
async function clickTarget(id='primary'){const r=await target(id);assert(r,'visible direct target '+id);await mouse('mouseMoved',r.x,r.y);await mouse('mousePressed',r.x,r.y);await mouse('mouseReleased',r.x,r.y);}
async function load(scene){await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=${scene}`});await until(`typeof __toy==='object'&&!__toy.stats().loading&&__toy.stats().waterState==='on'&&document.querySelector('.toy-scene-action')!==null`);await pause(300);assert.equal(await ev('document.querySelector(".toy-foot")'),null);assert.equal(await ev('__toy.stats().scene'),scene);}
try{
 const portFile=path.join(profile,'DevToolsActivePort'),launchDeadline=Date.now()+30000;while(!fs.existsSync(portFile)){if(chrome.exitCode!==null||Date.now()>launchDeadline)throw Error('Chrome launch failed');await pause(50);}
 const debug=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]),tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
 ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){let p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));});
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1180,height:780,deviceScaleFactor:1,mobile:false});
 await load('douse-fire');await ev('__toy.pause(true)');await pause(250);
 const before=await sim('firePourPending');await clickTarget();assert.equal(await sim('firePourPending'),before+2400,'water-source click queues real water');
 await clickTarget('fire-source');assert.equal(await sim('firePourPending'),before+4800,'fire click queues real water');
 await ev('__toy.pause(false)');await until('__toy.fire().stats().poured>0');console.log('FIRE water source and fire admit native water');
 await load('thumb-straw');let straw=await target();await mouse('mousePressed',straw.x,straw.y);await until('__toy.machineState()?.thumbHeld===true&&!__toy.stats().loading');
 assert.equal(await ev('document.querySelector(".toy-scene-action").hidden'),false,'held target survives asynchronous refill');
 await mouse('mouseReleased',straw.x,straw.y);await until('__toy.machineState()?.thumbHeld===false');
 await ev('document.querySelector(".toy-scene-action").focus()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await until('__toy.machineState()?.thumbHeld===true&&!__toy.stats().loading');await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await until('__toy.machineState()?.thumbHeld===false');
 straw=await target();await mouse('mousePressed',straw.x,straw.y);await until('__toy.machineState()?.thumbHeld===true&&!__toy.stats().loading');await ev('document.querySelector(".toy-scene-action").dispatchEvent(new PointerEvent("pointercancel",{pointerId:1,bubbles:true}))');await until('__toy.machineState()?.thumbHeld===false');await mouse('mouseReleased',straw.x,straw.y);
 await ev('document.querySelector(".toy-scene-action").focus()');await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await until('__toy.machineState()?.thumbHeld===true&&!__toy.stats().loading');await ev('document.getElementById("toy-pause").click()');await until('__toy.machineState()?.thumbHeld===false');await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
 console.log('THUMB pointer release, keyboard release, pointer cancel, pause release passed');
 await load('siphon');await ev('__toy.pause(true)');await pause(250);const valveBefore=await ev('__toy.builder().getParts().find(p=>p.type==="flap").open');await clickTarget();assert.equal(await ev('__toy.builder().getParts().find(p=>p.type==="flap").open'),!valveBefore,'paused valve toggles real wall state');console.log('VALVE direct paused toggle passed');
 await load('roman-inverted-siphon');const closed=await ev('__toy.machineState().definition.primary.closed');await clickTarget();await until(`__toy.machineState().definition.primary.closed===${!closed}`);console.log('INTAKE toggle passed');
 await load('water-balloons');await sim('gravMul=0;applyGravity();');let b=await ev('__toy.machineControls()[0]'),coords=await sim(`(function(){var r=stage.getBoundingClientRect();return {x:r.left+${b.x}*fitScale,y:r.top+${b.y}*fitScale};})()`);
 await mouse('mousePressed',coords.x,coords.y);await mouse('mouseMoved',coords.x+70,coords.y-20,{buttons:1});await mouse('mouseReleased',coords.x+70,coords.y-20);assert.equal(await ev('__toy.machineState().primaryUsed'),false,'drag preserves balloon');
 await pause(250);b=await ev('__toy.machineControls()[0]');coords=await sim(`(function(){var r=stage.getBoundingClientRect();return {x:r.left+${b.x}*fitScale,y:r.top+${b.y}*fitScale};})()`);await mouse('mousePressed',coords.x,coords.y);await mouse('mouseReleased',coords.x,coords.y);await until('__toy.machineState().primaryUsed===true');console.log('BALLOON drag preserves skin, short click pops');
 assert.equal(errors.length,0,JSON.stringify(errors));console.log('PASS direct actions; no browser errors');
}finally{
 for(const p of pending.values())clearTimeout(p.timer);ws?.close();
 if(chrome.exitCode===null&&chrome.signalCode===null){
  const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();
  const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);
 }
 await new Promise(r=>server.close(r));fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}

