// Viewport containment for every registered scene and live smoke/fire framing.
// Owns one Chrome for Testing child, with no use of the personal browser.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.resolve(process.env.DUMP || '/tmp/water-demo-bounds');
fs.mkdirSync(output,{recursive:true});
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'water-demo-bounds-'));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server=createServer((request,response)=>{
  try{
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    assert(file.startsWith(root+path.sep));
    let bytes=fs.readFileSync(file);
    if(file===path.join(root,'js/water-smoke-slime.js')){
      var source=bytes.toString();
      // Sample the unchanged solver's outer cells more closely than its
      // normal 96 by 54 instrument readback. Only this diagnostic FBO grows.
      if((request.headers.referer || '').includes('boundarycheck=1'))source=source.replace('flowSample = createFBO(96, 54,','flowSample = createFBO(512, 512,').replace('flowValues = new Float32Array(96 * 54 * 4);','flowValues = new Float32Array(512 * 512 * 4);');
      const end=source.lastIndexOf('})();');
      bytes=source.slice(0,end)+'window.__boundsTest=function(source){return eval(source);};\n'+source.slice(end);
    }
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});response.end(bytes);
  }catch{response.writeHead(404).end();}
});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let browser,socket,sequence=0;
const pending=new Map(),errors=[],checks=[],disclosures=[],boundaries=[],thermal={};
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
const inside=source=>evaluate('__boundsTest('+JSON.stringify(source)+')');
function checkBounds(row){
  const {stage,viewport,screen,top}=row;
  assert(stage.left>=viewport.left-.1 && stage.right<=viewport.right+.1 && stage.top>=viewport.top-.1 && stage.bottom<=viewport.bottom+.1,
    'Entire simulation fits viewport: '+JSON.stringify(row));
  assert(stage.left>=-.1 && stage.right<=screen.width+.1 && stage.top>=top.bottom-.1 && stage.bottom<=screen.height+.1,
    'Entire simulation clears screen and top controls: '+JSON.stringify(row));
  assert(screen.scrollWidth<=screen.width+1 && screen.scrollHeight<=screen.height+1,
    'App does not scroll outside screen: '+JSON.stringify(row));
  checks.push(row);
}
const geometry=`(()=>{const rect=id=>document.getElementById(id).getBoundingClientRect().toJSON();
  return {scene:currentScene,world:{w:worldW,h:worldH},stage:rect('toy-stage'),viewport:rect('toy-viewport'),
    top:document.querySelector('.toy-top').getBoundingClientRect().toJSON(),
    screen:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}};})()`;
async function load(scene,width,height,mobile=false,boundaryCheck=false){
  await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/archive/water-smoke-slime/water-smoke-slime.html?scene='+scene+'&paused=1'+(boundaryCheck?'&boundarycheck=1':'')});
  for(let i=0;i<180;i++){
    if(await evaluate('!!window.__boundsTest && __toy.stats().waterState!=="booting" && (!WSSMachineRegistry.lookup('+JSON.stringify(scene)+') || __toy.machineState()?.ready)'))break;
    if(i===179)throw Error('Scene did not boot: '+scene+' '+JSON.stringify(await evaluate('({stats:window.__toy?.stats(),build:window.__toy?.buildState(),air:window.__toy?.airStats(),errors:'+JSON.stringify(errors)+'})')));await delay(100);
  }
  await evaluate('__toy.pause(true);__toy.resize()');await delay(60);
}
async function checkDisclosure(selector,panelSelector){
  if(!await evaluate('(()=>{var e=document.querySelector('+JSON.stringify(selector)+');return !!e && !e.hidden;})()'))return;
  await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');await delay(60);
  const row=await evaluate('(()=>{var e=document.querySelector('+JSON.stringify(panelSelector)+'),r=e.getBoundingClientRect();return {panel:'+JSON.stringify(panelSelector)+',width:innerWidth,height:innerHeight,left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()');
  assert(row.left>=-.1 && row.right<=row.width+.1 && row.top>=-.1 && row.bottom<=row.height+.1,
    'Open disclosure fits screen: '+JSON.stringify(row));disclosures.push(row);
  await evaluate('document.querySelector('+JSON.stringify(selector)+').click()');await delay(20);
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
  const sizes=[[1440,900,false],[1512,700,false],[980,700,false],[844,390,true],[568,320,true],[390,844,true],[320,500,true],[375,500,true]];
  // Actual GPU-backed hosts exercise fire, smoke, water, gel and both toolbar layouts.
  for(const scene of ['douse-fire','chimney','falls','zerog','self-flushing-cup','smoke-wind-tunnel']){
    await load(scene,1440,900);
    for(const [width,height,mobile] of sizes){
      await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});
      await evaluate('__toy.resize()');await delay(40);checkBounds(await inside(geometry));
    }
  }
  await load('thermoscope',1440,900);
  await evaluate('__toy.machine("thermoscope",{unheated:true})');
  await evaluate('__toy.pause(false)');await delay(1800);
  thermal.unheated=await evaluate('__toy.instruments().thermoscope');
  assert(thermal.unheated && Number.isFinite(thermal.unheated.temperatureK),'Native thermoscope pocket supplies an actual temperature');
  await evaluate('__toy.machinePrimary()');
  for(let attempt=0;attempt<60;attempt++){
    await delay(100);thermal.heated=await evaluate('__toy.instruments().thermoscope');
    if(thermal.heated?.temperatureK>thermal.unheated.temperatureK+.2)break;
  }
  await evaluate('__toy.pause(true)');
  assert(thermal.heated?.temperatureK>thermal.unheated.temperatureK+.2,'Mapped heater warms the actual native gas bulb: '+JSON.stringify(thermal));
  await load('douse-fire',1440,900);await evaluate('__toy.pause(false);__toy.machinePrimary()');
  for(let attempt=0;attempt<100;attempt++){
    await delay(100);thermal.fire=await evaluate('__toy.fire().stats()');
    if(thermal.fire.quenchEvents>0 && thermal.fire.waterHeatJ>0)break;
  }
  await evaluate('__toy.pause(true)');
  assert(thermal.fire.quenchEvents>0 && thermal.fire.waterHeatJ>0,'Real admitted water still quenches the fire and absorbs heat: '+JSON.stringify(thermal.fire));
  await load('douse-fire',1440,900);
  await evaluate('__toy.pause(false)');await delay(3000);await evaluate('__toy.pause(true)');
  const smoke=await inside('({active:smokeActive,mask:getComputedStyle(smokeCanvas).maskImage,domain:smokeDomain,viewport:smokeViewport,fire:toyFire.stats()})');
  assert(smoke.active && smoke.fire.burning,'Actual fire and smoke are active');
  assert.equal(smoke.mask,'none','Smoke has no visual mask or fade');
  const frame=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  fs.writeFileSync(path.join(output,'douse-fire.png'),Buffer.from(frame.data,'base64'));
  for(const [width,height,mobile] of sizes){
    await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});await delay(60);
    await checkDisclosure('#toy-scene-picker > summary','#toy-scene-list');
    await checkDisclosure('#toy-instruments-open','#toy-panel-instruments');
    await checkDisclosure('#toy-about-open','#toy-panel-about');
  }
  // Drive actual dye and outward air velocity into all four real boundaries.
  // The outer velocity/dye cells must be empty after projection/advection;
  // interior dye must remain, proving the test did not just clear the field.
  for(const [width,height,mobile] of [[1440,900,false],[844,390,true],[320,500,true]]){
    await load('douse-fire',width,height,mobile,true);
    const result=await inside(`(()=>{
      var saved=SmokeFluid.getPhysics();SmokeFluid.setPhysics({HEAT:0,COOLING:0,BUOYANCY:0,WEIGHT:0},0);
      smokeEngine.clear();smokeRepaintObstacle();
      [[.035,.5,-220,0],[.965,.5,220,0],[.5,.035,0,-220],[.5,.965,0,220]].forEach(function(p){smokeEngine.splat(p[0],p[1],p[2],p[3],{r:1,g:.8,b:.6},.03);});
      for(var step=0;step<40;step++)SmokeFluid.step(1/120);
      var field=smokeEngine.sampleFlow(smokeDomain.w,smokeDomain.h),dye=0,normal=0,interior=0,nonfinite=0;
      for(var y=0;y<field.height;y++)for(var x=0;x<field.width;x++){
        var i=(y*field.width+x)*4;
        if(!Number.isFinite(field.values[i]) || !Number.isFinite(field.values[i+1]) || !Number.isFinite(field.values[i+3]))nonfinite++;
        if(x===0 || x===field.width-1 || y===0 || y===field.height-1){
          dye=Math.max(dye,Math.abs(field.values[i+3]));
          if(x===0 || x===field.width-1)normal=Math.max(normal,Math.abs(field.values[i]));
          if(y===0 || y===field.height-1)normal=Math.max(normal,Math.abs(field.values[i+1]));
        }else interior=Math.max(interior,field.values[i+3]);
      }
      var visible=viewport.getBoundingClientRect(),air=smokeCanvas.getBoundingClientRect();
      SmokeFluid.setPhysics(saved,0);smokeEngine.displayPass();
      return {screen:{width:innerWidth,height:innerHeight},domain:smokeDomain,visible:smokeViewport,canvas:air.toJSON(),viewport:visible.toJSON(),dye,normal,interior,nonfinite,sample:{width:field.width,height:field.height},mask:getComputedStyle(smokeCanvas).maskImage};
    })()`);
    assert.equal(result.nonfinite,0,'Boundary field remains finite');
    assert(result.dye<1e-6 && result.normal<1e-6,'No dye or normal flow passes hard boundaries: '+JSON.stringify(result));
    assert(result.interior>.01,'Actual smoke remains inside the boundaries');
    assert.equal(result.mask,'none');
    assert(Math.abs(result.canvas.left-(result.viewport.left+result.visible.left))<.1 && Math.abs(result.canvas.right-(result.viewport.left+result.visible.right))<.1 && Math.abs(result.canvas.top-(result.viewport.top+result.visible.top))<.1 && Math.abs(result.canvas.bottom-(result.viewport.top+result.visible.bottom))<.1,'Smoke domain matches its complete visible rectangle');
    boundaries.push(result);
    // A changed camera cannot retain hidden smoke fields.
    const reset=await inside('setCamera({zoom:2});var f=smokeEngine.sampleFlow(smokeDomain.w,smokeDomain.h),maxDye=0;for(var i=3;i<f.values.length;i+=4)maxDye=Math.max(maxDye,f.values[i]);({maxDye:maxDye,domain:smokeDomain})');
    assert.equal(reset.maxDye,0,'Zoom resets air to the newly visible physical domain');
  }
  await load('douse-fire',1440,900);
  // Every accepted authored world is passed through the real host fitter and
  // its real scene-specific CSS, including the maximum expanded room width.
  // No solver coefficients or apparatus geometry are altered by this sweep.
  const count=await evaluate('WSSMachineRegistry.list().length');
  for(const [width,height,mobile] of sizes){
    await send('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:1});await delay(40);
    const rows=await inside(`(()=>{var shell=document.getElementById('toy'),rows=[];
      WSSMachineRegistry.list().forEach(function(entry){
        currentScene=entry.id;worldW=entry.world.w;worldH=entry.world.h;
        if(roomScene(entry.id))worldW*=2;
        stage.style.width=worldW+'px';stage.style.height=worldH+'px';
        shell.dataset.scene=entry.id;shell.classList.add('is-native-machine');
        shell.classList.toggle('has-room',roomScene(entry.id));
        shell.classList.toggle('has-fire',/^(douse-fire|fire-brigade)$/.test(entry.id));
        shell.classList.toggle('has-wall-editor',wallEditorRequested(entry.id));
        fitStage();rows.push(${geometry});
      });return rows;})()`);
    rows.forEach(checkBounds);
  }
  assert.equal(errors.length,0,'No uncaught browser exceptions');
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({pass:true,acceptedScenes:count,sizes,checks,disclosures,boundaries,thermal,smoke,errors},null,2));
  console.log('PASS '+checks.length+' bounds checks and '+disclosures.length+' disclosure checks across '+count+' accepted scenes and '+sizes.length+' viewport sizes. '+output);
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
