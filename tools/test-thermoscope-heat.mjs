// Native heater response and real UI controls for the thermoscope.
// Owns one Chrome for Testing child, with no use of the personal browser.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.DUMP || '/tmp/thermoscope-heat-review');
fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'thermoscope-heat-'));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server=createServer((request,response)=>{
  try{
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    assert(file.startsWith(root+path.sep));
    let bytes=fs.readFileSync(file);
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});response.end(bytes);
  }catch{response.writeHead(404).end();}
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser,socket,sequence=0;
const pending=new Map(),errors=[],checks=[],thermal={};
function send(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},30000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;
}
async function load(scene,width,height,mobile=false,boundaryCheck=false){
  await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html?scene='+scene+'&paused=1'+(boundaryCheck?'&boundarycheck=1':'')});
  for(let i=0;i<180;i++){
    if(await evaluate('!!window.__toy && __toy.stats().waterState!=="booting" && (!WSSMachineRegistry.lookup('+JSON.stringify(scene)+') || __toy.machineState()?.ready)'))break;
    if(i===179)throw Error('Scene did not boot: '+scene+' '+JSON.stringify(await evaluate('({stats:window.__toy?.stats(),build:window.__toy?.buildState(),air:window.__toy?.airStats(),errors:'+JSON.stringify(errors)+'})')));await delay(100);
  }
  await evaluate('__toy.pause(true);__toy.resize()');await delay(60);
}
try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=spawn('/Users/ethan/.local/bin/agent-chrome-for-testing',[
    '--headless=new','--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'
  ],{stdio:'ignore'});
  let debug;
  for(let i=0;i<150;i++){
    try{debug=Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}
    if(debug)break;await delay(100);
  }
  assert(debug,'Chrome for Testing starts');
  const target=(await(await fetch('http://127.0.0.1:'+debug+'/json/list')).json()).find(page=>page.type==='page');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data),waiter=pending.get(message.id);
    if(waiter){clearTimeout(waiter.timer);pending.delete(message.id);message.error?waiter.reject(Error(JSON.stringify(message.error))):waiter.resolve(message.result);}
    else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  });
  await send('Runtime.enable');await send('Page.enable');
  await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});

  async function setHeat(value){
    await evaluate(`(()=>{let s=document.getElementById('toy-thermoscope-heat');s.value=${value};s.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    assert.equal(await evaluate('__toy.thermoscope().heatPower'),value);
  }
  async function advance(seconds){
    const target=await evaluate('__toy.instruments().simulationSeconds')+seconds,deadline=Date.now()+90000;
    await evaluate('__toy.pause(false)');
    while(await evaluate('__toy.instruments().simulationSeconds')<target){
      if(Date.now()>deadline)throw Error('Simulation did not advance');await delay(100);
    }
    await evaluate('__toy.pause(true)');await delay(120);
    const reading=await evaluate('__toy.instruments().thermoscope');
    assert(Number.isFinite(reading?.temperatureK));return reading;
  }
  await load('thermoscope',1440,900);
  assert.equal(await evaluate('document.getElementById("toy-thermoscope-control").hidden'),false);
  assert.equal(await evaluate('__toy.thermoscope().heatPower'),1);
  await setHeat(.1);thermal.low=await advance(5);console.log('LOW',JSON.stringify(thermal.low));
  await load('thermoscope',1440,900);
  await setHeat(20);thermal.high=await advance(5);console.log('HIGH',JSON.stringify(thermal.high));
  assert(thermal.high.temperatureK>thermal.low.temperatureK+2,'Higher output warms actual gas substantially');
  assert(thermal.high.columnLevel===null || thermal.high.columnLevel>thermal.low.columnLevel+1,'Higher heat pushes water down or clears the tube');
  assert(thermal.high.pocket.volume>thermal.low.pocket.volume+100,'Native gas expands into volume vacated by water');
  const before=await evaluate('__toy.instruments().simulationSeconds');
  await setHeat(0);await delay(400);
  assert.equal(await evaluate('__toy.instruments().simulationSeconds'),before,'Changing heat while paused does not advance physics');
  thermal.cooled=await advance(8);console.log('COOLED',JSON.stringify(thermal.cooled));
  assert(thermal.cooled.temperatureK<thermal.high.temperatureK-2,'Turning off cools actual trapped air');
  assert(Number.isFinite(thermal.cooled.columnLevel) && (thermal.high.columnLevel===null || thermal.cooled.columnLevel<thermal.high.columnLevel-1),'Cooling draws native water back up');
  await evaluate('__toy.machinePrimary()');assert.equal(await evaluate('__toy.thermoscope().heatPower'),20,'Heater restores last output');
  await evaluate('__toy.machinePrimary()');assert.equal(await evaluate('__toy.thermoscope().heatPower'),0);
  await setHeat(1);
  await evaluate('document.getElementById("toy-thermoscope-heat").focus()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  assert.equal(await evaluate('__toy.thermoscope().heatPower'),1.1,'Native keyboard range input adjusts output');
  for(const [width,height,mobile]of [[1440,900,false],[844,390,true],[568,320,true],[390,844,true],[320,500,true]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});await evaluate('__toy.resize()');await delay(150);
    const bounds=await evaluate(`(()=>{let e=document.getElementById('toy-thermoscope-control'),r=e.getBoundingClientRect(),s=document.getElementById('toy-thermoscope-heat').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,x:s.x+s.width*.7,y:s.y+s.height/2,height:s.height}})()`);
    assert(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=height,'Control fits viewport');assert(bounds.height>=44,'Touch target is at least 44px');checks.push({width,height,...bounds});
    if(mobile){
      await send('Emulation.setTouchEmulationEnabled',{enabled:true});
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:bounds.x,y:bounds.y}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(150);
      assert(await evaluate('__toy.thermoscope().heatPower')>10,'Touch changes heat');
    }else{
      await send('Input.dispatchMouseEvent',{type:'mousePressed',x:bounds.x,y:bounds.y,button:'left',clickCount:1});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:bounds.x,y:bounds.y,button:'left',clickCount:1});await delay(100);
      assert(await evaluate('__toy.thermoscope().heatPower')>10,'Pointer changes heat');
    }
    const capture=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,`thermoscope-${width}x${height}.png`),Buffer.from(capture.data,'base64'));
  }
  await send('Emulation.setTouchEmulationEnabled',{enabled:false});
  await load('thermoscope',1440,900);assert.equal(await evaluate('__toy.thermoscope().heatPower'),1,'Restart clears output');
  await evaluate('__toy.machine("thermoscope",{unheated:true})');await delay(500);assert.equal(await evaluate('__toy.thermoscope().heatPower'),0,'Unheated comparison starts off');
  await load('falls',1440,900);await delay(300);
  assert.equal(await evaluate('document.getElementById("toy-thermoscope-control").hidden'),true,'Control retires with scene');
  assert.equal(await evaluate('__toy.thermoscopeHeat(10)'),false,'Retired control cannot modify another scene');
  assert.equal(errors.length,0,'No uncaught browser exceptions');
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({pass:true,thermal,checks,errors},null,2));
  console.log('PASS thermoscope heat, native water response, pause, toggle memory, keyboard, pointer, touch, restart and scene cleanup');
}finally{
  try{socket?.close();}catch{}
  server.close();
  for(const waiter of pending.values())clearTimeout(waiter.timer);
  if(browser && browser.exitCode===null && browser.signalCode===null){
    const exited=new Promise(resolve=>browser.once('exit',resolve));browser.kill();
    const force=setTimeout(()=>browser.kill('SIGKILL'),2000);await exited;clearTimeout(force);
  }
  fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
