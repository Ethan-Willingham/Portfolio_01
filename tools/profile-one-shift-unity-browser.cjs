'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=process.env.SHIFT_PROFILE_DUMP || path.join(os.tmpdir(),'one-shift-frame-profile');
fs.mkdirSync(output,{recursive:true});
const seconds=Number(process.env.SHIFT_PROFILE_SECONDS || 90);
const profileForks=process.env.SHIFT_PROFILE_FORKS==='1';
const placementCapture=process.env.SHIFT_PROFILE_PLACEMENT_CAPTURE==='1';
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(body);}
  catch{res.writeHead(404).end();}
});
let browser, diagnosticPage, latestState;
const logs=[];
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,channel:process.env.SHIFT_BROWSER_CHANNEL||'chrome',args:['--enable-gpu',...(process.platform==='win32'?['--use-angle=d3d11']:[])]});
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
  const page=await context.newPage();
  diagnosticPage=page;
  page.on('console',message=>logs.push({type:message.type(),text:message.text(),at:Date.now()}));
  page.on('pageerror',error=>logs.push({type:'pageerror',text:error.message,at:Date.now()}));
  await page.addInitScript(()=>{
    const observed=window.renderProbe={sampleCounts:{},smaaShaders:0,fxaaShaders:0,postShaders:[],slowCalls:[]};
    for(const method of ['compileShader','linkProgram','getProgramParameter','getShaderParameter','readPixels','texImage2D','texSubImage2D','texStorage2D','renderbufferStorage','renderbufferStorageMultisample','drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','clientWaitSync','finish','getError']){
      const original=WebGL2RenderingContext.prototype[method];
      if(!original)continue;
      WebGL2RenderingContext.prototype[method]=function(...args){
        const start=performance.now();const result=original.apply(this,args);const duration=performance.now()-start;
        if(duration>20)observed.slowCalls.push({method,at:start,duration});
        return result;
      };
    }
    const storage=WebGL2RenderingContext.prototype.renderbufferStorageMultisample;
    WebGL2RenderingContext.prototype.renderbufferStorageMultisample=function(target,samples,...args){
      observed.sampleCounts[samples]=(observed.sampleCounts[samples]||0)+1;
      return storage.call(this,target,samples,...args);
    };
    const shaderSource=WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource=function(shader,source){
      if(/SMAA|_AreaTex|_SearchTex/.test(source))observed.smaaShaders++;
      if(/FXAA|Fxaa/.test(source))observed.fxaaShaders++;
      const keywords=source.match(/\b_[A-Za-z]*(?:SMAA|Fxaa|AreaTex|SearchTex)[A-Za-z_]*\b/g);
      if(keywords)observed.postShaders.push([...new Set(keywords)]);
      return shaderSource.call(this,shader,source);
    };
  });
  await page.addInitScript(()=>{
    const startup=window.startupProfile={clickedAt:null,readyAt:null,stages:[],views:[]};
    document.addEventListener('click',event=>{
      if(event.target.closest?.('#warehouse-play'))startup.clickedAt=performance.now();
    },true);
    document.addEventListener('load',event=>{
      if(event.target.tagName!=='SCRIPT'||!event.target.src.includes('OneShiftWeb.loader.js'))return;
      const factory=window.createUnityInstance;
      window.createUnityInstance=function(...args){
        const config=args[1],preparation=config.onOneShiftPreparation,finePreparation=config.onWarehousePreparation;
        config.onWarehousePreparation=function(value){
          let detail=value;
          if(typeof detail==='string'){try{detail=JSON.parse(detail);}catch{detail={};}}
          startup.views.push({at:performance.now()-startup.clickedAt,...detail});
          if(typeof finePreparation==='function')return finePreparation.apply(this,arguments);
        };
        config.onOneShiftPreparation=function(...values){
          const [completed,total,ready]=values;
          startup.stages.push({at:performance.now()-startup.clickedAt,completed,total,ready});
          if(typeof preparation==='function')return preparation.apply(this,values);
        };
        const launcher=document.getElementById('warehouse-launcher');
        const observer=new MutationObserver(()=>{
          if(launcher.hidden){startup.readyAt=performance.now();observer.disconnect();}
        });
        observer.observe(launcher,{attributes:true,attributeFilter:['hidden']});
        return factory.apply(this,args).then(instance=>{window.actualUnity=instance;return instance;});
      };
    },true);
  });
  await page.goto(process.env.SHIFT_PROFILE_URL || 'http://127.0.0.1:'+server.address().port+'/one-shift.html');
  await page.locator('#warehouse-play').click();
  await page.waitForFunction(()=>window.actualUnity&&document.getElementById('warehouse-launcher').hidden,null,{timeout:180000});
  await page.bringToFront();
  await page.locator('#warehouse-canvas').click({position:{x:700,y:450}});
  // Unity can queue pointer capture in the frame following the first click.
  // Fulfil that native request before starting the measurement.
  await page.waitForTimeout(200);
  if (!await page.evaluate(() => document.pointerLockElement === document.getElementById('warehouse-canvas')))
    await page.locator('#warehouse-canvas').click({position:{x:700,y:450}});
  await page.waitForFunction(() => document.pointerLockElement === document.getElementById('warehouse-canvas'));
  await page.evaluate(()=>{
    const p=window.frameProfile={start:performance.now(),deltas:[],longTasks:[],visibility:[],states:[],events:[],stopped:false};
    p.observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())p.longTasks.push({at:entry.startTime-p.start,duration:entry.duration});});
    p.observer.observe({type:'longtask',buffered:false});
    let previous=performance.now();
    function frame(now){if(p.stopped)return; p.deltas.push({at:now-p.start,ms:now-previous});previous=now;p.raf=requestAnimationFrame(frame);}
    p.raf=requestAnimationFrame(frame);
    addEventListener('blur',()=>p.visibility.push({at:performance.now()-p.start,event:'blur'}));
    addEventListener('focus',()=>p.visibility.push({at:performance.now()-p.start,event:'focus'}));
    document.addEventListener('visibilitychange',()=>p.visibility.push({at:performance.now()-p.start,event:document.visibilityState}));
  });
  console.log('Profiling '+seconds+' seconds without screenshot capture.');
  const stop=Date.now()+seconds*1000;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function state(label){
    const prefix='ONE_SHIFT_STATE ';
    const emitted=page.waitForEvent('console',{predicate:message=>message.text().includes(prefix),timeout:15000});
    await page.evaluate(()=>actualUnity.SendMessage('BrowserLifecycle','ReportState',''));
    const message=(await emitted).text();
    latestState=JSON.parse(message.slice(message.indexOf(prefix)+prefix.length).trim());
    await page.evaluate(({label,state})=>frameProfile.states.push({at:performance.now()-frameProfile.start,label,state}),{label,state:latestState});
    return latestState;
  }
  async function event(name){
    await page.evaluate(name=>frameProfile.events.push({at:performance.now()-frameProfile.start,name}),name);
    console.log('SCENARIO '+name);
  }
  async function until(label,predicate,timeout=15000){
    const deadline=Date.now()+timeout;
    do{
      const current=await state(label);
      if(predicate(current))return current;
      await delay(100);
    }while(Date.now()<deadline);
    throw new Error(label+' timed out: '+JSON.stringify(latestState));
  }
  async function keyUntil(key,label,predicate,timeout){
    await page.keyboard.down(key);
    try{return await until(label,predicate,timeout);}
    finally{await page.keyboard.up(key);}
  }
  let mouseX=700,mouseY=450;
  const leverSamples=[];
  async function faceForklift(){
    const deadline=Date.now()+12000;
    let current=await state('walk.aim.start');
    for(;;){
      const desired=Math.atan2(current.forkliftPosition[0]-current.playerPosition[0],
        current.forkliftPosition[2]-current.playerPosition[2])*180/Math.PI;
      const difference=((desired-current.playerYaw+540)%360)-180;
      if(Math.abs(difference)<2)return current;
      if(Date.now()>deadline)throw new Error('Native mouse aiming toward the forklift timed out: '+JSON.stringify(current));
      mouseX+=Math.sign(difference)*Math.min(16,Math.max(1,Math.abs(difference)*3));
      await page.mouse.move(mouseX,mouseY);
      await delay(35);
      current=await state('walk.aim.moving');
    }
  }
  async function moveLeverTo(target,label,tolerance=.025){
    // Observe the real lever after native pointer events. Browser pixel density
    // and the Unity mouse axis need not have a fixed one-to-one conversion.
    const deadline=Date.now()+12000;
    let current=await state(label+'.start');
    while(Math.abs(current.forkliftSlider-target)>tolerance){
      if(Date.now()>deadline)throw new Error(label+' could not reach '+target+': '+JSON.stringify(current));
      if(!current.forkliftAssistActive||!current.forkliftCaptured)
        throw new Error(label+' lost its held hydraulic control: '+JSON.stringify(current));
      const difference=target-current.forkliftSlider;
      mouseY-=Math.sign(difference)*Math.min(12,Math.max(1,Math.abs(difference)*80));
      await page.mouse.move(mouseX,mouseY);
      await delay(35);
      current=await state(label+'.moving');
    }
    return current;
  }
  async function sampleLever(target,label){
    await event(label+'.move.start');
    const positioned=await moveLeverTo(target,label+'.position');
    await until(label+'.flow',current=>current.frameCount>=positioned.frameCount+2&&current.forkliftMouseLiftInput>.04);
    await event(label+'.sample.start');
    const before=await state(label+'.before');
    const began=Date.now();
    // The pointer stays completely still during this sample. The selected
    // position must maintain hydraulic flow without repeated mouse movement.
    await delay(800);
    const after=await state(label+'.after');
    const sample={label,target,seconds:(Date.now()-began)/1000,slider:after.forkliftSlider,
      valve:after.forkliftMouseLiftInput,rise:after.forkliftLiftHeight-before.forkliftLiftHeight,
      frameCount:after.frameCount-before.frameCount};
    leverSamples.push(sample);
    await event(label+'.sample.end');
    if(!after.forkliftAssistActive||after.forkliftMouseLiftInput<=.04||sample.rise<=.005)
      throw new Error(label+' did not maintain physical lift with a stationary mouse: '+JSON.stringify({before,after,sample}));
    return sample;
  }
  if(profileForks){
    await event('forks.start');
    const initial=await state('forks.initial');
    if(initial.browserPreparing||initial.browserSuspended||initial.timeScale<=0||!Array.isArray(initial.forkliftPosition))
      throw new Error('Fork scenario started before an active, prepared warehouse: '+JSON.stringify(initial));
    await page.waitForFunction(()=>document.pointerLockElement===document.getElementById('warehouse-canvas'));
    await until('walk.controlsReady',current=>current.frameCount>=initial.frameCount+3);
    // The click that acquires pointer lock can include a native look delta.
    // Turn toward the truck using the mouse, without resetting or teleporting.
    await event('walk.aim.start');
    await faceForklift();
    await event('walk.aim.complete');
    await event('walk.start');
    const approach=await keyUntil('w','walk.approach',current=>
      Math.hypot(current.playerPosition[0]-current.forkliftPosition[0],current.playerPosition[2]-current.forkliftPosition[2])<2.25);
    await until('walk.released',current=>current.frameCount>=approach.frameCount+2);
    await event('walk.reached');
    const training=await keyUntil('e','training.open',current=>current.forkliftTraining&&current.forkliftDriving&&current.forkliftTrainingStep==='brake');
    await until('training.keyReleased',current=>current.frameCount>=training.frameCount+2&&current.forkliftCaptured);
    await delay(350);
    const handoff=await state('training.neutralHandoff');
    const ownsPointer=await page.evaluate(()=>document.pointerLockElement===document.getElementById('warehouse-canvas'));
    if(!handoff.forkliftCaptured||handoff.browserSuspended||!ownsPointer)
      throw new Error('Forklift entry lost native pointer ownership without further input: '+JSON.stringify(handoff));
    await event('training.opened');
    await event('training.brake.start');
    await keyUntil('Space','training.brake',current=>current.forkliftTrainingStep==='lift');
    await event('training.brake.complete');
    await page.keyboard.down('ShiftLeft');
    try{
      await event('training.lift.start');
      const held=await until('training.lever.open',current=>current.forkliftForkViewActive&&current.forkliftAssistActive&&Math.abs(current.forkliftSlider)<.01);
      await moveLeverTo(.72,'training.lever.raise');
      const raised=await until('training.lift',current=>current.forkliftTrainingStep==='center');
      if(raised.forkliftLiftHeight<=held.forkliftLiftHeight+.025)
        throw new Error('Training did not raise the actual empty forks: '+JSON.stringify({held,raised}));
      await event('training.lift.complete');
      await event('training.center.start');
      const centered=await moveLeverTo(0,'training.lever.center',.04);
      const stopped=await until('training.center',current=>current.frameCount>=centered.frameCount+18&&current.forkliftMouseLiftInput===0);
      if(Math.abs(stopped.forkliftLiftHeight-centered.forkliftLiftHeight)>.035)
        throw new Error('Centred training lever did not hold height: '+JSON.stringify({centered,stopped}));
      await event('training.center.complete');
    }finally{await page.keyboard.up('ShiftLeft');}
    await event('training.release');
    await until('training.complete',current=>current.forkliftDriving&&!current.forkliftTraining&&current.forkliftCaptured&&current.forkliftTrainingStep==='complete');
    await event('training.complete');
    await page.keyboard.down('ShiftLeft');
    try{
      await event('forks.hold');
      await until('forks.centered',current=>current.forkliftForkViewActive&&current.forkliftAssistActive&&Math.abs(current.forkliftSlider)<.01);
      const fine=await sampleLever(.4,'forks.fine');
      const full=await sampleLever(1,'forks.full');
      if(full.valve<.9||full.valve<=fine.valve*3||full.rise/full.seconds<=fine.rise/fine.seconds*1.5)
        throw new Error('Full hydraulic travel did not produce a stronger physical lift than fine control: '+JSON.stringify({fine,full}));
      await event('forks.center.start');
      const centered=await moveLeverTo(0,'forks.center',.04);
      await until('forks.centeredHold',current=>current.frameCount>=centered.frameCount+18&&current.forkliftMouseLiftInput===0);
      await event('forks.center.complete');
    }finally{await page.keyboard.up('ShiftLeft');}
    await event('forks.release');
    await until('forks.released',current=>!current.forkliftAssistActive&&!current.forkliftForkViewActive&&current.forkliftLiftInput===0&&current.forkliftSlider===0);
    await event('forks.complete');
  }
  while(Date.now()<stop){await delay(Math.min(10000,stop-Date.now()));await state('periodic');}
  const result=await page.evaluate(()=>{
    const p=window.frameProfile;p.stopped=true;cancelAnimationFrame(p.raf);p.observer.disconnect();
    const canvas=document.getElementById('warehouse-canvas'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const ms=p.deltas.slice(5).map(x=>x.ms).sort((a,b)=>a-b),percentile=q=>ms[Math.min(ms.length-1,Math.floor(ms.length*q))];
    return {startupSeconds:(startupProfile.readyAt-startupProfile.clickedAt)/1000,preparationStages:startupProfile.stages,
      preparationViews:startupProfile.views,
      longestPreparationUpdateGapMs:Math.max(0,...startupProfile.views.slice(1).map((view,i)=>view.at-startupProfile.views[i].at)),
      playStartedAt:p.start,seconds:(performance.now()-p.start)/1000,frames:ms.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:ms[ms.length-1],over50:p.deltas.filter(x=>x.ms>50),longTasks:p.longTasks,visibility:p.visibility,scenarioEvents:p.events,states:p.states,
      slowCallsDuringPlay:window.renderProbe.slowCalls.filter(call=>call.at>=p.start),
      viewport:{width:canvas.width,height:canvas.height,dpr:devicePixelRatio},renderProbe:window.renderProbe,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  result.forkScenario=profileForks;
  result.leverSamples=leverSamples;
  fs.writeFileSync(path.join(output,'profile.json'),JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(logs,null,2));
  if(profileForks&&placementCapture){
    // Measurement is stopped and profile.json is already final. These native
    // inputs and visual captures cannot enter the 90-second frame statistics.
    await until('placement.doorsReady',current=>current.receivingDoorsOpen,30000);
    await page.keyboard.down('ShiftLeft');
    try{
      await until('placement.lever.open',current=>current.forkliftAssistActive&&Math.abs(current.forkliftSlider)<.01);
      await moveLeverTo(-.9,'placement.lever.lower');
      await until('placement.lower',current=>current.forkliftLiftHeight<.09);
      await moveLeverTo(0,'placement.lever.center',.04);
    }finally{await page.keyboard.up('ShiftLeft');}
    await page.keyboard.down('b');
    try{
      await keyUntil('w','placement.enterTrailer',current=>current.forkliftPosition[2]>12.31,45000);
    }finally{await page.keyboard.up('b');}
    await keyUntil('Space','placement.stop',current=>Math.abs(current.forkliftSignedSpeed)<.04);
    await page.keyboard.down('ShiftLeft');
    try{
      const placement=await until('placement.visible',current=>current.forkliftForkViewActive&&
        typeof current.forkliftForkViewTarget==='string'&&current.forkliftForkViewTarget.length>0);
      fs.writeFileSync(path.join(output,'placement-state.json'),JSON.stringify(placement,null,2));
      await page.screenshot({path:path.join(output,'profile-placement.png'),scale:'css'});
      await keyUntil('c','placement.cab',current=>current.forkliftCabView);
      await page.screenshot({path:path.join(output,'profile-placement-cab.png'),scale:'css'});
    }finally{await page.keyboard.up('ShiftLeft');}
    fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(logs,null,2));
  }
  await page.screenshot({path:path.join(output,'profile-scene.png'),scale:'css'});
  console.log(JSON.stringify(result,null,2));
})().catch(async error=>{
  fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(logs,null,2));
  let partial=null;
  if(diagnosticPage&&!diagnosticPage.isClosed()){
    try{partial=await diagnosticPage.evaluate(()=>({startup:window.startupProfile,profile:window.frameProfile?{
      start:frameProfile.start,events:frameProfile.events,states:frameProfile.states,longTasks:frameProfile.longTasks
    }:null}));}catch{}
  }
  fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({error:error.stack||String(error),latestState,partial},null,2));
  console.error(error);process.exitCode=1;
}).finally(async()=>{if(browser)await browser.close();server.close();});
