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
    const startup=window.startupProfile={clickedAt:null,readyAt:null,stages:[]};
    document.addEventListener('click',event=>{
      if(event.target.closest?.('#warehouse-play'))startup.clickedAt=performance.now();
    },true);
    document.addEventListener('load',event=>{
      if(event.target.tagName!=='SCRIPT'||!event.target.src.includes('OneShiftWeb.loader.js'))return;
      const factory=window.createUnityInstance;
      window.createUnityInstance=function(...args){
        const config=args[1],preparation=config.onOneShiftPreparation;
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
  if(profileForks){
    await event('forks.start');
    const initial=await state('forks.initial');
    if(initial.browserPreparing||initial.browserSuspended||initial.timeScale<=0||!Array.isArray(initial.forkliftPosition))
      throw new Error('Fork scenario started before an active, prepared warehouse: '+JSON.stringify(initial));
    // The click that acquires pointer lock can include a native mouse delta.
    // R restores the authored spawn heading through the ordinary player input.
    await event('walk.reset.start');
    const reset=await keyUntil('r','walk.reset',current=>current.frameCount>=initial.frameCount+3&&
      Math.hypot(...current.playerPosition.map((value,index)=>value-initial.playerPosition[index]))<.1);
    await until('walk.resetReleased',current=>current.frameCount>=reset.frameCount+2);
    await event('walk.reset.complete');
    await event('walk.start');
    const approach=await keyUntil('w','walk.approach',current=>
      Math.hypot(current.playerPosition[0]-current.forkliftPosition[0],current.playerPosition[2]-current.forkliftPosition[2])<2.25);
    await until('walk.released',current=>current.frameCount>=approach.frameCount+2);
    await event('walk.reached');
    const training=await keyUntil('e','training.open',current=>current.forkliftTraining&&current.forkliftDriving);
    await until('training.keyReleased',current=>current.frameCount>=training.frameCount+2);
    await event('training.opened');
    const seated=await keyUntil('e','training.acknowledge',current=>current.forkliftDriving&&!current.forkliftTraining&&current.forkliftCaptured);
    await until('training.keyReleasedAgain',current=>current.frameCount>=seated.frameCount+2);
    await event('training.acknowledged');
    await page.keyboard.down('x');
    let raised;
    try{
      await event('forks.hold');
      const held=await until('forks.held',current=>current.forkliftForkViewActive&&current.forkliftAssistActive);
      await event('forks.mouseMove.start');
      // Native pointer events span real frames. This intentionally never calls
      // Unity control methods or substitutes the keyboard hydraulic controls.
      let mouseY=450;
      for(let i=0;i<40;i++){
        mouseY-=8;
        await page.mouse.move(700,mouseY);
        await delay(20);
      }
      raised=await state('forks.mouseMove.end');
      await event('forks.mouseMove.end');
      if(!raised.forkliftForkViewActive||raised.forkliftLiftHeight<=held.forkliftLiftHeight+.02)
        throw new Error('Native X + mouse movement did not raise the physical forks: '+JSON.stringify({held,raised}));
    }finally{await page.keyboard.up('x');}
    await event('forks.release');
    await until('forks.released',current=>!current.forkliftAssistActive&&!current.forkliftForkViewActive&&current.forkliftLiftInput===0);
    await event('forks.complete');
  }
  while(Date.now()<stop){await delay(Math.min(10000,stop-Date.now()));await state('periodic');}
  const result=await page.evaluate(()=>{
    const p=window.frameProfile;p.stopped=true;cancelAnimationFrame(p.raf);p.observer.disconnect();
    const canvas=document.getElementById('warehouse-canvas'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
    const ms=p.deltas.slice(5).map(x=>x.ms).sort((a,b)=>a-b),percentile=q=>ms[Math.min(ms.length-1,Math.floor(ms.length*q))];
    return {startupSeconds:(startupProfile.readyAt-startupProfile.clickedAt)/1000,preparationStages:startupProfile.stages,
      playStartedAt:p.start,seconds:(performance.now()-p.start)/1000,frames:ms.length,p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:ms[ms.length-1],over50:p.deltas.filter(x=>x.ms>50),longTasks:p.longTasks,visibility:p.visibility,scenarioEvents:p.events,states:p.states,
      slowCallsDuringPlay:window.renderProbe.slowCalls.filter(call=>call.at>=p.start),
      viewport:{width:canvas.width,height:canvas.height,dpr:devicePixelRatio},renderProbe:window.renderProbe,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  });
  result.forkScenario=profileForks;
  fs.writeFileSync(path.join(output,'profile.json'),JSON.stringify(result,null,2));
  fs.writeFileSync(path.join(output,'console.json'),JSON.stringify(logs,null,2));
  if(profileForks&&placementCapture){
    // Measurement is stopped and profile.json is already final. These native
    // inputs and visual captures cannot enter the 90-second frame statistics.
    await until('placement.doorsReady',current=>current.receivingDoorsOpen,30000);
    await keyUntil('z','placement.lower',current=>current.forkliftLiftHeight<.09);
    await page.keyboard.down('Shift');
    try{
      await keyUntil('w','placement.enterTrailer',current=>current.forkliftPosition[2]>12.31,45000);
    }finally{await page.keyboard.up('Shift');}
    await keyUntil('Space','placement.stop',current=>Math.abs(current.forkliftSignedSpeed)<.04);
    await page.keyboard.down('x');
    try{
      const placement=await until('placement.visible',current=>current.forkliftForkViewActive&&
        typeof current.forkliftForkViewTarget==='string'&&current.forkliftForkViewTarget.length>0);
      fs.writeFileSync(path.join(output,'placement-state.json'),JSON.stringify(placement,null,2));
      await page.screenshot({path:path.join(output,'profile-placement.png'),scale:'css'});
      await keyUntil('c','placement.cab',current=>current.forkliftCabView);
      await page.screenshot({path:path.join(output,'profile-placement-cab.png'),scale:'css'});
    }finally{await page.keyboard.up('x');}
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
