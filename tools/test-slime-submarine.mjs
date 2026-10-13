// Real GPU playback and input checks in an owned Chrome for Testing process.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=process.env.DUMP || fs.mkdtempSync(path.join(os.tmpdir(),'slime-submarine-review-'));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'slime-submarine-browser-'));
fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg'};
const errors=[],observations=[],pending=new Map();
let chrome,socket,serial=0;
const server=createServer((request,response)=>{
  try {
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(fs.readFileSync(file));
  } catch {response.writeHead(404).end();}
});
function call(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},45000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function ev(expression){
  const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}
const stateExpression='(()=>{const s=window.__toy?.submarine?.();return s&&typeof s.stats==="function"?s.stats():s;})()';
const state=()=>ev(stateExpression);
async function until(expression,timeout=30000){
  const end=Date.now()+timeout;
  while(Date.now()<end){if(await ev(expression))return;await delay(80);}
  throw Error('Timed out: '+expression+'; submarine '+JSON.stringify(await state()));
}
async function untilState(predicate,description,timeout=30000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const s=await state();if(s&&predicate(s))return s;await delay(100);}
  throw Error('Timed out: '+description+'; submarine '+JSON.stringify(await state()));
}
function check(label,condition){assert(condition,label);console.log('PASS '+label);}
function released(s){return s && s.input && !Object.values(s.input).some(Boolean);}
async function record(name){
  const s=await state();observations.push({name,state:s});console.log(name,JSON.stringify(s));
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));return s;
}
async function target(selector){
  await until(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!e&&!e.disabled&&!!e.getClientRects().length;})()`,5000);
  const item=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,disabled:e.disabled,visible:!!e.getClientRects().length&&getComputedStyle(e).visibility!=="hidden",hit:!!hit&&(hit===e||e.contains(hit)),name:e.getAttribute("aria-label")||e.textContent.trim()};})()`);
  assert(item&&item.visible&&!item.disabled,'Visible enabled target '+selector);
  return item;
}
const direction=name=>'[data-submarine-direction="'+name+'"]';
async function mouse(type,x,y,extra={}){
  await call('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1,...extra});
}
async function click(selector){const t=await target(selector);await mouse('mouseMoved',t.x,t.y);await mouse('mousePressed',t.x,t.y);await mouse('mouseReleased',t.x,t.y);}
async function press(name){const t=await target(direction(name));await mouse('mouseMoved',t.x,t.y);await mouse('mousePressed',t.x,t.y);await untilState(s=>s.input[name],name+' hold starts');return t;}
async function releaseOutside(){await mouse('mouseMoved',3,3,{buttons:1});await mouse('mouseReleased',3,3);await untilState(released,'outside release clears force');}
async function key(type,key,code,virtual,extra={}){await call('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:virtual,...extra});}
async function load(width=1180,height=780,mobile=false){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});
  await call('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
  await call('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=slime-submarine`});
  await until('!!window.__toy?.submarine?.() && __toy.machineState()?.ready && !__toy.stats().loading && __toy.stats().waterState==="on"',60000);
  await until('!!document.querySelector("#toy-submarine-controls [data-submarine-direction]")');
  await untilState(s=>s.waterCount>0&&Number.isFinite(s.x+s.y+s.density),'fresh submarine physics sample');
  await delay(250);
}
async function finite(label){
  check(label,await ev('__toy.bodies().length===1 && __toy.bodies().every(b=>[...b.px,...b.py,...b.ox,...b.oy].every(Number.isFinite))'));
  const s=await state();check(label+' native water remains finite',s.nonfinite===0);
}
async function layout(name){
  const view=await ev('({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,headerBottom:document.querySelector(".toy-top").getBoundingClientRect().bottom})');
  check(name+' has no horizontal overflow',view.scrollWidth<=view.width);
  const boxes=[];
  for(const selector of ['#submarine-valve','#submarine-course-reset',...['left','right','up','down'].map(direction)]){
    const t=await target(selector);boxes.push({selector,...t});
    check(name+' '+selector+' is visible, unobstructed and at least 44 pixels',t.hit && t.width>=44 && t.height>=44 && t.left>=-1 && t.right<=view.width+1 && t.top>=view.headerBottom-1 && t.bottom<=view.height+1 && t.name.length>0);
  }
  const panel=await ev('(()=>{const r=document.getElementById("toy-submarine-controls").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()');
  const apparatus=await ev('(()=>{const d=__toy.machineState().definition,v=d.vessels[0].rect,c=__toy.camera(),s=document.getElementById("toy-stage").getBoundingClientRect();return {left:s.left+v.x*c.scale,right:s.left+(v.x+v.width)*c.scale,top:s.top+v.y*c.scale,bottom:s.top+(v.y+v.height)*c.scale};})()');
  check(name+' controls leave the tank clear',panel.left>=apparatus.right-1 || panel.right<=apparatus.left+1 || panel.top>=apparatus.bottom-1 || panel.bottom<=apparatus.top+1);
  observations.push({name,view,boxes,panel,apparatus});await record(name);
}
async function desktopInputs(){
  let t=await press('right');const before=await state();
  const moved=await untilState(s=>s.x>before.x+12,'held force moves the hull right',15000);
  check('right input moves the real elastic hull',moved.x>before.x+12);await releaseOutside();
  await finite('steering preserves finite hull coordinates');
  for(const event of ['pointercancel','lostpointercapture']){
    t=await press('left');
    await ev(`document.querySelector(${JSON.stringify(direction('left'))}).dispatchEvent(new PointerEvent(${JSON.stringify(event)},{pointerId:1,bubbles:true}))`);
    await untilState(released,event+' clears input');await mouse('mouseReleased',t.x,t.y);
  }
  t=await press('left');await ev('window.dispatchEvent(new Event("blur"))');await untilState(released,'window blur clears input');await mouse('mouseReleased',t.x,t.y);await ev('window.dispatchEvent(new Event("focus"))');
  await delay(100);check('focus return does not restore a previous hold',released(await state()));
  for(const [name,letter,code,keyCode] of [['right','d','KeyD',68],['up','w','KeyW',87]]){
    await ev('document.getElementById("toy-input").focus()');await key('keyDown',letter,code,keyCode);await untilState(s=>s.input[name],letter+' starts steering');
    await key('keyDown',letter,code,keyCode,{autoRepeat:true});await key('keyUp',letter,code,keyCode);await untilState(released,letter+' release clears steering');
  }
  for(const [k,code,n] of [[' ','Space',32],['Enter','Enter',13]]){
    await ev(`document.querySelector(${JSON.stringify(direction('up'))}).focus()`);await key('keyDown',k,code,n);await untilState(s=>s.input.up,k+' holds focused steering');
    await key('keyUp',k,code,n);await untilState(released,k+' release clears focused steering');
  }
  t=await press('up');await ev('__toy.pause(true)');await untilState(released,'pause clears steering');await mouse('mouseReleased',t.x,t.y);await delay(200);
  const frozen=await ev('__toy.bodies().map(b=>[...b.px,...b.py])');await delay(350);
  assert.deepEqual(await ev('__toy.bodies().map(b=>[...b.px,...b.py])'),frozen,'pause freezes hull coordinates');
  await ev('__toy.pause(false)');check('resume does not restore held steering',released(await state()));
  t=await press('down');await ev('document.getElementById("toy-restart").click()');await until('__toy.machineState()?.ready&&!__toy.stats().loading');await untilState(released,'scene restart clears force');await mouse('mouseReleased',t.x,t.y);
  check('restart restores closed ballast and empty course',await ev(`(()=>{const s=${stateExpression};return !s.open&&Number(s.visited)===0;})()`));
  console.log('PASS mouse, keyboard, cancellation, focus, pause and restart');
}
async function ballast(){
  await ev('__toy.pause(false)');const before=await state();
  await click('#submarine-valve');await untilState(s=>s.open,'ballast valve opens');
  // A downward control force submerges the real opening. Only the existing
  // native flow is allowed to change the carried water inventory.
  await ev('__toy.submarineInput("down",true)');
  let wet;
  try {wet=await untilState(s=>s.carried>before.carried+40,'water passes through the open ballast slit',30000);}
  finally {await ev('__toy.submarineInput("down",false)');}
  check('flooding adds carried native water and shell mass',wet.carried>before.carried+40 && wet.totalMass>before.totalMass);
  check('density is measured total mass divided by displaced mass',Math.abs(wet.density-wet.totalMass/wet.displacedMass)<1e-6);
  check('opening the valve conserves all native water',wet.waterCount===before.waterCount);
  await click('#submarine-valve');await untilState(s=>!s.open,'ballast valve closes');await delay(700);
  const sealed=await record('desktop-ballast-sealed');await delay(800);const later=await state();
  check('closed hull retains its measured ballast',Math.abs(later.carried-sealed.carried)<=2);
  check('closing the valve conserves native water',later.waterCount===before.waterCount);
  await finite('ballast loading preserves finite hull coordinates');
  check('closed skin has no parcel side violations',later.sideViolations===0);
  await ev('__toy.pause(true)');await delay(250);const pausedBefore=await state();
  check('paused console disables steering',await ev('Array.from(document.querySelectorAll("[data-submarine-direction]")).every(b=>b.disabled)'));
  await click('#submarine-valve');const pausedAfter=await state();
  check('paused valve changes the opening without moving the hull',pausedAfter.open!==pausedBefore.open && pausedAfter.x===pausedBefore.x && pausedAfter.y===pausedBefore.y && pausedAfter.waterCount===pausedBefore.waterCount);
  await ev('__toy.pause(false)');
}
async function pilotCourse(){
  const targets=await ev('__toy.machineState().definition.submarine.targets'),end=Date.now()+45000,trace=[];
  try {
    while(Date.now()<end){
      const s=await state();trace.push({x:s.x,y:s.y,vx:s.vx,vy:s.vy,visited:s.visited});
      if(s.completed)break;
      const t=targets[s.visited];
      // This test pilot uses only the public held-force inputs. Velocity
      // feedback brakes ahead of each ring without assigning a trajectory.
      const dx=t.x-s.x-s.vx*.22,dy=t.y-s.y-s.vy*.22;
      const input={left:dx< -4,right:dx>4,up:dy< -4,down:dy>4};
      await ev(`Object.entries(${JSON.stringify(input)}).forEach(([name,on])=>__toy.submarineInput(name,on))`);
      await delay(70);
    }
  } finally {await ev('["left","right","up","down"].forEach(name=>__toy.submarineInput(name,false))');}
  observations.push({name:'force-pilot',trace});
  const result=await record('desktop-course-complete');
  check('all three rings are reachable using held forces alone',result.completed && result.visited===3);
  await finite('completed course keeps the hull finite');
  await click('#submarine-course-reset');await untilState(s=>s.visited===0&&!s.completed&&released(s),'course restart resets markers and input');
}
async function touchInputs(){
  for(const release of ['touchEnd','touchCancel']){
    const t=await target(direction('left'));
    await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.x,y:t.y,id:1,radiusX:8,radiusY:8,force:1}]});
    await untilState(s=>s.input.left,'touch starts force');await delay(200);
    await call('Input.dispatchTouchEvent',{type:release,touchPoints:[]});await untilState(released,release+' clears force');
  }
  const t=await target('#submarine-valve'),before=await state();
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:t.x,y:t.y,id:1,radiusX:8,radiusY:8,force:1}]});
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await untilState(s=>s.open!==before.open,'touch toggles actual valve');
}
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  chrome=spawn(path.join(os.homedir(),'.local/bin/agent-chrome-for-testing'),['--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  const portFile=path.join(profile,'DevToolsActivePort'),end=Date.now()+30000;
  while(!fs.existsSync(portFile)){if(chrome.exitCode!==null||Date.now()>end)throw Error('Owned Chrome failed to start');await delay(50);}
  const debug=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);
  const tabs=await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json();
  socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}
    else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);
    else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(a=>a.value||a.description));
  });
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await call('Network.setBlockedURLs',{urls:['*googletagmanager.com*','*google-analytics.com*']});
  await load();await layout('desktop');await finite('initial hull coordinates are finite');
  if(process.env.PREVIEW_ONLY!=='1'){
    await desktopInputs();await pilotCourse();await ballast();
    await ev('__toy.pause(false)');const held=await press('right');
    await ev('__toy.scene("water-balloons")');await until('window.__toy?.stats().scene==="water-balloons"&&__toy.machineState()?.ready&&!__toy.stats().loading',60000);await mouse('mouseReleased',held.x,held.y);
    check('leaving the scene retires its controls and runtime',await ev('!__toy.submarine() && (!document.getElementById("toy-submarine-controls") || document.getElementById("toy-submarine-controls").hidden)'));
    await ev('__toy.scene("slime-submarine")');await until('window.__toy?.stats().scene==="slime-submarine"&&__toy.machineState()?.ready&&!__toy.stats().loading',60000);await untilState(released,'returning starts with no held input');
  }
  for(const [width,height] of [[844,390],[390,844]]){
    await load(width,height,true);await layout(`mobile-${width}x${height}`);
    if(process.env.PREVIEW_ONLY!=='1')await touchInputs();await finite(`mobile ${width}x${height} physics`);
  }
  check('all browser scenarios report no runtime errors',errors.length===0);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,observations,errors},null,2));
  console.log('PASS slime submarine browser regression. Captures: '+out);
} catch(error){
  if(socket?.readyState===WebSocket.OPEN){try{await record('failure');}catch{}}
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:false,error:error.stack,observations,errors},null,2));throw error;
} finally {
  for(const item of pending.values())clearTimeout(item.timer);socket?.close();
  if(chrome&&chrome.exitCode===null&&chrome.signalCode===null){const exited=new Promise(resolve=>chrome.once('exit',resolve));chrome.kill();const force=setTimeout(()=>chrome.kill('SIGKILL'),2000);await exited;clearTimeout(force);}
  if(server.listening)await new Promise(resolve=>server.close(resolve));
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
