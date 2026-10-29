'use strict';
// Profile the compiled populated Sandbox. Native mouse/keyboard input is the
// only gameplay control; diagnostics run before and after the measured window.
// No screenshots or ReportState/ReportWmsState polling enter that window.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {chromium} = require('playwright');
const {classifyUnityConsole} = require('./one-shift-unity-console.cjs');
const root = path.resolve(__dirname, '..');
const output = process.env.SHIFT_WMS_PROFILE_DUMP || path.join(os.tmpdir(), 'one-shift-wms-profile');
const seconds = Number(process.env.SHIFT_WMS_PROFILE_SECONDS || 90);
assert.ok(Number.isFinite(seconds) && seconds >= 90 && seconds <= 600, 'Profile duration must be 90 to 600 seconds.');
fs.mkdirSync(output, {recursive:true});
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server = http.createServer((request,response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(fs.readFileSync(file)); }
  catch { response.writeHead(404).end(); }
});
let browser, page, mouseX=700, mouseY=450, initial, final, currentStage='initialization';
const messages=[], pageErrors=[], requestErrors=[], observations=[];
const delay = milliseconds => new Promise(resolve => setTimeout(resolve,Math.max(0,milliseconds)));
const angleDelta = (to,from) => ((to-from+540)%360)-180;
function stage(value) { currentStage=value;console.log('PROFILE '+value); }

(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:process.env.SHIFT_WMS_PROFILE_HEADED!=='1',channel:process.env.SHIFT_BROWSER_CHANNEL || 'chrome',
    args:['--enable-gpu',...(process.platform==='win32'?['--use-angle=d3d11']:[])]});
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
  page=await context.newPage();
  page.on('console',message=>messages.push({type:message.type(),text:message.text(),at:Date.now()}));
  page.on('pageerror',error=>pageErrors.push({text:error.message,at:Date.now()}));
  page.on('response',response=>{if(response.status()>=400)requestErrors.push({status:response.status(),url:response.url()});});
  await page.addInitScript(()=>{
    // WebGL method times are CPU entry-point latency, including any driver
    // blocking. They are deliberately not described as GPU execution time.
    const probe=window.wmsRenderProbe={frameSerial:0,lastDrawSerial:-1,lastPresentSerial:-1,drawFrames:[],presentFrames:[],
      slowCalls:[],methodStats:{startup:{},play:{}},sampleCounts:{},smaaShaders:0,fxaaShaders:0,longTasks:[],rafFrames:[],
      events:[],visibility:[],start:null,stop:null,phase:'startup',stopped:false};
    const framebuffers=new WeakMap();
    const isWarehouse=gl=>gl.canvas?.id==='warehouse-canvas';
    const stamp=()=>({at:performance.now(),phase:probe.phase,interactive:!!document.getElementById('warehouse-wms-handheld')?.classList.contains('is-interactive')});
    function draw(gl,present){
      if(!isWarehouse(gl))return;
      if(probe.lastDrawSerial!==probe.frameSerial){probe.lastDrawSerial=probe.frameSerial;probe.drawFrames.push(stamp());}
      if(present&&probe.lastPresentSerial!==probe.frameSerial){probe.lastPresentSerial=probe.frameSerial;probe.presentFrames.push(stamp());}
    }
    const bind=WebGL2RenderingContext.prototype.bindFramebuffer;
    WebGL2RenderingContext.prototype.bindFramebuffer=function(target,value){
      const result=bind.call(this,target,value);
      if(target===this.FRAMEBUFFER||target===this.DRAW_FRAMEBUFFER)framebuffers.set(this,value);
      return result;
    };
    const draws=new Set(['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','blitFramebuffer']);
    for(const name of ['compileShader','linkProgram','getProgramParameter','getShaderParameter','readPixels','texImage2D','texSubImage2D',
      'texStorage2D','renderbufferStorage','renderbufferStorageMultisample','drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced',
      'blitFramebuffer','clientWaitSync','finish','flush','getError']){
      const original=WebGL2RenderingContext.prototype[name];if(!original)continue;
      WebGL2RenderingContext.prototype[name]=function(...args){
        const began=performance.now();const result=original.apply(this,args);const elapsed=performance.now()-began;
        if(isWarehouse(this)){
          const measured=probe.start!==null&&probe.stop===null;
          const bucket=probe.methodStats[measured?'play':'startup'];
          const value=bucket[name]||(bucket[name]={calls:0,totalMs:0,maxMs:0,over1:0,over5:0,over20:0});
          value.calls++;value.totalMs+=elapsed;value.maxMs=Math.max(value.maxMs,elapsed);
          if(elapsed>1)value.over1++;if(elapsed>5)value.over5++;if(elapsed>20)value.over20++;
          if(elapsed>20)probe.slowCalls.push({method:name,at:began,duration:elapsed,phase:probe.phase});
          if(draws.has(name))draw(this,!framebuffers.get(this));
          if(name==='renderbufferStorageMultisample')probe.sampleCounts[args[1]]=(probe.sampleCounts[args[1]]||0)+1;
        }
        return result;
      };
    }
    const source=WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource=function(shader,text){
      if(isWarehouse(this)){if(/SMAA|_AreaTex|_SearchTex/.test(text))probe.smaaShaders++;if(/FXAA|Fxaa/.test(text))probe.fxaaShaders++;}
      return source.call(this,shader,text);
    };
    probe.observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())probe.longTasks.push({at:entry.startTime,duration:entry.duration});});
    probe.observer.observe({type:'longtask',buffered:true});
    let previous=performance.now();
    function frame(now){
      if(probe.stopped)return;
      probe.frameSerial++;probe.rafFrames.push({at:now,ms:now-previous,phase:probe.phase,
        interactive:!!document.getElementById('warehouse-wms-handheld')?.classList.contains('is-interactive')});
      previous=now;probe.raf=requestAnimationFrame(frame);
    }
    probe.raf=requestAnimationFrame(frame);
    for(const name of ['blur','focus'])addEventListener(name,()=>probe.visibility.push({at:performance.now(),event:name}));
    document.addEventListener('visibilitychange',()=>probe.visibility.push({at:performance.now(),event:document.visibilityState}));
    const startup=window.wmsStartupProfile={clickedAt:null,readyAt:null,mode:null,stages:[],views:[]};
    document.addEventListener('click',event=>{
      const entry=event.target.closest?.('#warehouse-play,#warehouse-sandbox');
      if(entry){startup.clickedAt=performance.now();startup.mode=entry.id==='warehouse-sandbox'?'sandbox':'career';}
    },true);
    document.addEventListener('load',event=>{
      if(event.target.tagName!=='SCRIPT'||!event.target.src.includes('OneShiftWeb.loader.js'))return;
      const factory=window.createUnityInstance;if(typeof factory!=='function')return;
      window.createUnityInstance=function(...args){
        const config=args[1],preparation=config.onOneShiftPreparation,finePreparation=config.onWarehousePreparation,hud=config.onWarehouseHUD;
        config.onWarehousePreparation=function(value){
          let detail=value;if(typeof detail==='string'){try{detail=JSON.parse(detail);}catch{detail={};}}
          startup.views.push({at:performance.now()-startup.clickedAt,...detail});
          if(typeof finePreparation==='function')return finePreparation.apply(this,arguments);
        };
        config.onOneShiftPreparation=function(...values){
          const [completed,total,ready]=values;startup.stages.push({at:performance.now()-startup.clickedAt,completed,total,ready});
          if(typeof preparation==='function')return preparation.apply(this,values);
        };
        config.onWarehouseHUD=function(payload){
          window.wmsObservedHUD=typeof payload==='string'?JSON.parse(payload):payload;
          if(typeof hud==='function')return hud.apply(this,arguments);
        };
        const launcher=document.getElementById('warehouse-launcher');
        const observer=new MutationObserver(()=>{if(launcher.hidden){startup.readyAt=performance.now();observer.disconnect();}});
        observer.observe(launcher,{attributes:true,attributeFilter:['hidden']});
        return factory.apply(this,args).then(instance=>{window.actualUnity=instance;return instance;});
      };
    },true);
  });
  async function report(method,prefix){
    const parts=[],partPrefix='WAREHOUSE_WMS_PART ';let count=null,listener,timer;
    const emitted=new Promise((resolve,reject)=>{
      const finish=(error,value)=>{clearTimeout(timer);page.off('console',listener);error?reject(error):resolve(value);};
      listener=message=>{
        const text=message.text(),whole=text.indexOf(prefix),part=text.indexOf(partPrefix);
        try{
          if(whole>=0){finish(null,JSON.parse(text.slice(whole+prefix.length).trim()));return;}
          if(method!=='ReportWmsState'||part<0)return;
          const fragment=text.slice(part+partPrefix.length),match=/^(\d+)\/(\d+) ([\s\S]*)$/.exec(fragment);
          if(!match)throw new Error('Malformed WMS diagnostic fragment.');
          const index=Number(match[1]),total=Number(match[2]);
          if(total<1||total>5000||index<0||index>=total||(count!==null&&count!==total))throw new Error('Inconsistent WMS diagnostic fragment count.');
          count=total;parts[index]=match[3].replace(/\r?\n$/,'');
          if(parts.filter(value=>typeof value==='string').length===count)finish(null,JSON.parse(parts.join('')));
        }catch(error){finish(error);}
      };
      timer=setTimeout(()=>finish(new Error(method+' diagnostic timeout; received '+parts.filter(value=>typeof value==='string').length+'/'+count+' fragments.')),15000);
      page.on('console',listener);
    });
    // SendMessage emits synchronously before Playwright resolves evaluate.
    // Register rejection handling now, then propagate it through await below.
    emitted.catch(()=>{});
    try{await page.evaluate(method=>actualUnity.SendMessage('BrowserLifecycle',method,''),method);return await emitted;}
    finally{clearTimeout(timer);page.off('console',listener);}
  }
  async function world(label){const state=await report('ReportState','ONE_SHIFT_STATE ');observations.push({label,at:Date.now(),state});return state;}
  async function click(locator){const rect=await locator.boundingBox();await locator.click();if(rect){mouseX=rect.x+rect.width/2;mouseY=rect.y+rect.height/2;}}
  async function moveMouse(dx,dy=0){mouseX+=dx;mouseY+=dy;await page.mouse.move(mouseX,mouseY);}
  async function mark(name){stage(name);await page.evaluate(name=>{const p=wmsRenderProbe;p.phase=name;p.events.push({name,at:performance.now()});},name);}
  async function hold(key,milliseconds){await page.keyboard.down(key);try{await delay(milliseconds);}finally{await page.keyboard.up(key);}}
  stage('load populated Sandbox');
  await page.goto(process.env.SHIFT_WMS_PROFILE_URL || 'http://127.0.0.1:'+server.address().port+'/one-shift.html');
  await click(page.locator('#warehouse-sandbox'));
  await page.waitForFunction(()=>window.actualUnity&&document.getElementById('warehouse-launcher').hidden,null,{timeout:240000});
  await page.bringToFront();await click(page.locator('#warehouse-canvas'));await delay(250);
  if(!await page.evaluate(()=>document.pointerLockElement?.id==='warehouse-canvas'))await click(page.locator('#warehouse-canvas'));
  await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');await delay(500);
  const opening=await world('opening'),inventory=await report('ReportWmsState','WAREHOUSE_WMS ');
  assert.ok(opening.buildVersion>=10&&inventory.state.mode==='sandbox','The compiled v10 Sandbox must be loaded.');
  assert.equal(inventory.bodies.length,102,'Profile must contain the 100 opening and two unreceived cartons.');
  assert.equal(inventory.state.items.reduce((sum,item)=>sum+item.onHand,0),100,'Opening on-hand stock must be 100 CTN.');
  assert.ok(inventory.conserves,'Opening inventory must conserve.');
  assert.ok(!opening.browserPreparing&&!opening.browserSuspended&&opening.timeScale>0,'Opening simulation must be active.');
  assert.ok(Math.hypot(opening.playerPosition[0],opening.playerPosition[2]+3.6)<.12,'Profile must start in the clear front cross-aisle.');
  // Calibrate and aim with native input before any timed data is collected.
  const before=await world('mouse calibration before');await moveMouse(80);await delay(150);
  const after=await world('mouse calibration after'),degreesPerPixel=angleDelta(after.playerYaw,before.playerYaw)/80;
  assert.ok(Number.isFinite(degreesPerPixel)&&degreesPerPixel>.02&&degreesPerPixel<3,'Native mouse calibration must be valid.');
  for(let i=0;i<8;i++){
    const current=await world('aim cross-aisle'),error=angleDelta(90,current.playerYaw);if(Math.abs(error)<.3)break;
    await moveMouse(Math.max(-400,Math.min(400,error/degreesPerPixel)));await delay(120);
  }
  initial=await world('immediately before measurement');
  assert.ok(Math.abs(angleDelta(90,initial.playerYaw))<.7,'Walk profile must face east along the clear cross-aisle.');
  const beforeFingerprint=JSON.stringify(inventory.state.cartons.map(c=>[c.id,c.binId,c.status]));
  await page.evaluate(()=>{const p=wmsRenderProbe;p.start=performance.now();p.phase='idle-populated';p.methodStats.play={};p.events.push({name:p.phase,at:p.start});});
  const began=Date.now(),end=began+seconds*1000;
  const until=async elapsed=>delay(Math.max(0,began+elapsed*1000-Date.now()));
  stage('idle-populated');await until(20);
  await mark('walk-clear-front-cross-aisle');
  // Each forward/back pair covers under 1.6 m. The east-west strip at z=-3.6
  // lies between the floor stock and staging, away from parked forklift x=0,z=-6.
  for(let pair=0;pair<10;pair++){await hold('w',380);await delay(350);await hold('s',380);await delay(350);}
  await until(38);
  await mark('pan-populated-racks');
  for(let cycle=0;cycle<3;cycle++){
    for(const degrees of [-30,-30,30,30]){await moveMouse(degrees/degreesPerPixel);await delay(650);}
  }
  await until(49);
  await mark('tc22-task-selector');await page.keyboard.press('q');
  await page.waitForFunction(()=>document.getElementById('warehouse-wms-handheld')?.classList.contains('is-interactive'));
  await delay(1500);await click(page.locator('[data-wms-tile="lookup"]'));await delay(1500);
  await mark('tc22-return-to-scanning');await click(page.locator('[data-device-floor]'));
  await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');
  await until(58);
  await mark('tc22-native-scan-input');
  // Item lookup is read-only; the native trigger also exercises honest no-label
  // feedback if this cross-aisle view does not put a barcode inside its beam.
  for(let i=0;i<3;i++){await page.keyboard.press('f');await delay(700);}
  await until(64);
  await mark('tc22-equipped-pan');
  for(let cycle=0;cycle<2;cycle++)for(const degrees of [-25,25,25,-25]){await moveMouse(degrees/degreesPerPixel);await delay(650);}
  await until(72);
  await mark('tc22-open-and-stow');await page.keyboard.press('q');
  await page.waitForFunction(()=>document.getElementById('warehouse-wms-handheld')?.classList.contains('is-interactive'));
  await delay(1200);await click(page.getByRole('button',{name:'Stow',exact:true}));
  await page.waitForFunction(()=>document.pointerLockElement?.id==='warehouse-canvas');
  await mark('idle-populated-after-device');await delay(end-Date.now());
  const result=await page.evaluate(()=>{
    const p=wmsRenderProbe;p.stop=performance.now();p.stopped=true;cancelAnimationFrame(p.raf);p.observer.disconnect();
    const between=value=>value.at>=p.start&&value.at<=p.stop;
    const summary=values=>{
      const sorted=values.slice().sort((a,b)=>a-b),at=q=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))]:null;
      return {samples:sorted.length,p50:at(.5),p95:at(.95),p99:at(.99),max:sorted.length?sorted[sorted.length-1]:null,
        mean:values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null,over33:values.filter(v=>v>33.5).length,over50:values.filter(v=>v>50).length,over100:values.filter(v=>v>100).length};
    };
    const raf=p.rafFrames.filter(between),interactiveRanges=[];
    let openRange=null;
    // Unity may submit no frame while the task selector pauses it. The native
    // RAF observer still sees the DOM state between the two render endpoints.
    for(const frame of raf){
      if(frame.interactive&&openRange===null)openRange={start:frame.at,stop:p.stop};
      else if(!frame.interactive&&openRange!==null){openRange.stop=frame.at;interactiveRanges.push(openRange);openRange=null;}
    }
    if(openRange!==null)interactiveRanges.push(openRange);
    const intervals=frames=>{
      let rangeIndex=0;
      return frames.slice(1).map((frame,index)=>{
        const previous=frames[index];
        while(rangeIndex<interactiveRanges.length&&interactiveRanges[rangeIndex].stop<previous.at)rangeIndex++;
        const range=interactiveRanges[rangeIndex],endpointInteractive=frame.interactive||previous.interactive;
        const interactive=endpointInteractive||!!(range&&range.start<=frame.at&&range.stop>=previous.at);
        return {at:frame.at-p.start,ms:frame.at-previous.at,phase:frame.phase,interactive,endpointInteractive};
      });
    };
    const present=p.presentFrames.filter(between),draw=p.drawFrames.filter(between),presentIntervals=intervals(present),drawIntervals=intervals(draw);
    const canvas=document.getElementById('warehouse-canvas'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const phases=p.events.filter(between).map((event,index,events)=>{
      const stop=index+1<events.length?events[index+1].at:p.stop,inside=sample=>sample.at+p.start>=event.at&&sample.at+p.start<stop;
      return {name:event.name,seconds:(stop-event.at)/1000,present:summary(presentIntervals.filter(inside).map(s=>s.ms)),
        activePresent:summary(presentIntervals.filter(s=>inside(s)&&!s.interactive).map(s=>s.ms)),
        pausedPresent:summary(presentIntervals.filter(s=>inside(s)&&s.interactive).map(s=>s.ms)),
        longTasks:p.longTasks.filter(task=>task.at>=event.at&&task.at<stop)};
    });
    return {mode:'sandbox',method:'Canvas presentation intervals are default-framebuffer draw/blit submissions, grouped by the independent native RAF probe. Draw-bearing intervals also include offscreen render work. Compiled Unity frame counts are read only before and after the measurement. No browser scheduling API is replaced.',
      caveat:'WebGL method timings measure CPU entry-point latency and possible driver blocking, not GPU execution duration. Wrappers and RAF observation add small instrumentation overhead. TC22 task-selection pauses are reported separately.',
      startup:{seconds:(wmsStartupProfile.readyAt-wmsStartupProfile.clickedAt)/1000,...wmsStartupProfile,
        methodStats:p.methodStats.startup,longTasks:p.longTasks.filter(task=>task.at<p.start),slowCalls:p.slowCalls.filter(call=>call.at<p.start)},
      measured:{start:p.start,stop:p.stop,seconds:(p.stop-p.start)/1000,present:summary(presentIntervals.map(s=>s.ms)),
        activePresent:summary(presentIntervals.filter(s=>!s.interactive).map(s=>s.ms)),pausedPresent:summary(presentIntervals.filter(s=>s.interactive).map(s=>s.ms)),
        interactiveRanges:interactiveRanges.map(range=>({start:range.start-p.start,stop:range.stop-p.start,duration:range.stop-range.start})),
        draw:summary(drawIntervals.map(s=>s.ms)),raf:summary(raf.map(s=>s.ms)),
        presentIntervals,drawIntervals,rafIntervals:raf.map(s=>({...s,at:s.at-p.start})),longTasks:p.longTasks.filter(between),
        slowCalls:p.slowCalls.filter(between),methodStats:p.methodStats.play,visibility:p.visibility.filter(between),phases},
      render:{sampleCounts:p.sampleCounts,smaaShaders:p.smaaShaders,fxaaShaders:p.fxaaShaders,viewport:{width:canvas.width,height:canvas.height,dpr:devicePixelRatio},
        renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)},
      lastObservedHUD:window.wmsObservedHUD};
  });
  // Measurement has ended. Read-only native-player evidence and screenshots
  // below cannot affect the timing statistics retained above.
  stage('post-measurement validation');final=await world('immediately after measurement');
  const finalInventory=await report('ReportWmsState','WAREHOUSE_WMS ');
  result.compiledFrames={before:initial.frameCount,after:final.frameCount,delta:final.frameCount-initial.frameCount};
  result.initialState=initial;result.finalState=final;result.degreesPerPixel=degreesPerPixel;
  result.stock={before:inventory.state.items.reduce((sum,item)=>sum+item.onHand,0),after:finalInventory.state.items.reduce((sum,item)=>sum+item.onHand,0),
    bodies:finalInventory.bodies.length,conserves:finalInventory.conserves,unchanged:beforeFingerprint===JSON.stringify(finalInventory.state.cartons.map(c=>[c.id,c.binId,c.status]))};
  result.nativeInput={scanSequenceBefore:inventory.state.scan.sequence,scanSequenceAfter:finalInventory.state.scan.sequence,
    selectedTile:finalInventory.state.workflow.tile,finalPosition:final.playerPosition};
  result.console=classifyUnityConsole(messages);
  result.pageErrors=pageErrors;result.requestErrors=requestErrors;
  result.passed=result.measured.seconds>=seconds-.1&&result.measured.present.samples>300&&result.compiledFrames.delta>300&&result.stock.conserves&&result.stock.unchanged&&
    result.nativeInput.scanSequenceAfter-result.nativeInput.scanSequenceBefore>=3&&result.nativeInput.selectedTile==='lookup'&&Math.abs(final.playerPosition[2]+3.6)<.25&&Math.abs(final.playerPosition[0])<2.5&&
    !result.measured.visibility.some(event=>event.event==='blur'||event.event==='hidden')&&
    !final.browserSuspended&&final.timeScale>0&&!final.forkliftDriving&&result.console.shaderFailures.length===0&&pageErrors.length===0&&requestErrors.length===0;
  fs.writeFileSync(path.join(output,'profile.json'),JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(messages,null,2));
  fs.writeFileSync(path.join(output,'observations.json'),JSON.stringify(observations,null,2));
  await page.screenshot({path:path.join(output,'profile-scene.png'),scale:'css'});
  console.log(JSON.stringify({passed:result.passed,output,seconds:result.measured.seconds,compiledFrames:result.compiledFrames,
    present:result.measured.present,activePresent:result.measured.activePresent,pausedPresent:result.measured.pausedPresent,longTasks:result.measured.longTasks,slowCalls:result.measured.slowCalls,
    renderer:result.render.renderer,stock:result.stock,input:result.nativeInput,shaderFailures:result.console.shaderFailures},null,2));
  assert.ok(result.passed,'Populated native WMS profile must preserve stock, stay in the cross-aisle and report real rendered frames without runtime errors.');
})().catch(async error=>{
  fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(messages,null,2));
  let partial=null;
  if(page&&!page.isClosed())try{partial=await page.evaluate(()=>({startup:window.wmsStartupProfile,probe:window.wmsRenderProbe?{
    start:wmsRenderProbe.start,phase:wmsRenderProbe.phase,events:wmsRenderProbe.events,longTasks:wmsRenderProbe.longTasks}:null}));}catch{}
  fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({stage:currentStage,error:error.stack||String(error),initial,final,observations,partial},null,2));
  console.error(error);process.exitCode=1;
}).finally(async()=>{
  if(page&&!page.isClosed())for(const key of ['w','s','a','d','ShiftLeft'])await page.keyboard.up(key).catch(()=>{});
  if(browser)await browser.close();server.close();
});
