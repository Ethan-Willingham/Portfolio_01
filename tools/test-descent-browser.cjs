// NODE_PATH=/.../node_modules node tools/test-descent-browser.cjs
// Fixtures are served only by this test, never shipped as route rooms.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=process.env.DESCENT_TEST_OUTPUT||'/tmp/descent-browser-evidence';fs.mkdirSync(output,{recursive:true});
const ids=['soap-film','negative-temperature','hydrogen-exactly','qcd-lava-lamp'];
let browser;const errors=[];const report={date:new Date().toISOString(),routeModules:{},servedSourceHashes:{},checks:[],screenshots:[],performance:{}};
const instrumentation=`\nwindow.__descentTest={registry,get manager(){return manager;},get device(){return device;},get clock(){return clock;},draw,updateUI,wake,openRoom,chooseRoom,save:persist,async seek(p){clock.seek(p);automatic=true;await openRoom(ROUTE[clock.index].id);},async advance(n){const paused=manualPaused;manualPaused=false;hidden=false;offscreen=false;if(raf)cancelAnimationFrame(raf);raf=0;for(let i=0;i<n;i++){tick();while(loading)await new Promise(r=>setTimeout(r,0));if(raf)cancelAnimationFrame(raf);raf=0;if(manager.active?.id==='qcd-lava-lamp')await manager.active.room.waitForIdle?.();if(i%60===59)await device.queue.onSubmittedWorkDone();}manualPaused=paused;dirty=true;draw();updateUI(true);},async restoreClock(p){clock.seek(p);automatic=true;dirty=true;draw();},async lose(){device.destroy();}};\n`;
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try{let b=fs.readFileSync(file);if(file.endsWith('.js')){const key=path.relative(root,file),hash=createHash('sha256').update(b).digest('hex');report.servedSourceHashes[key]??=[];if(!report.servedSourceHashes[key].includes(hash))report.servedSourceHashes[key].push(hash);}if(file.endsWith('/js/descent.js'))b=Buffer.concat([b,Buffer.from(instrumentation)]);
    const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.woff2':'font/woff2'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(b);
  }catch(_){res.writeHead(404).end();}
});
const fixture=id=>`export const roomInfo={apiVersion:1,id:${JSON.stringify(id)},title:${JSON.stringify(id)},model:${JSON.stringify(id==='qcd-lava-lamp'?'SU(3) contract fixture, not a physical model':'Contract fixture, not a physical model')},representativeScaleMeters:null,scaleMeaning:'Test units',sources:[]};
export async function createRoom({device,seed,quality,assetBaseURL}){let steps=0,disposed=false,size;
 const b=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const m=device.createShaderModule({code:'@vertex fn v(@builtin(vertex_index)i:u32)->@builtin(position)vec4f {let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);}@fragment fn f(@builtin(position)p:vec4f)->@location(0)vec4f{return vec4f(${id===ids[0]?'.6,.2,.1':id===ids[1]?'.1,.4,.2':id===ids[2]?'.5,.4,.1':'.3,.2,.5'},1);}'});
 const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:m,entryPoint:'v'},fragment:{module:m,entryPoint:'f',targets:[{format:'rgba16float'}]}});
 return{resize(s){size=s;},step({dtSeconds}){if(disposed)throw Error('disposed step');if(dtSeconds!==1/60)throw Error('wrong dt');steps++;},render({encoder,targetView,width,height}){if(!size||size.width!==width)throw Error('resize first');const p=encoder.beginRenderPass({colorAttachments:[{view:targetView,loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});p.setPipeline(pipeline);p.draw(3);p.end();},snapshot(){return{apiVersion:1,id:roomInfo.id,model:roomInfo.model,numericalStepCount:steps,simulationTime:steps/60,simulationTimeUnits:'fixture units',parameters:{group:${JSON.stringify(id===ids[3]?'SU(3)':'test')}},quality,seedProvenance:{seed},diagnosticAgeSeconds:0,timeAxisMeaning:'Test ambient clock',diagnostics:{steps},routeEvent:{pending:false,complete:true}};},async debugReadback(){return{steps,fixture:true};},dispose(){disposed=true;b.destroy();}};}`;
const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
const snap=p=>p.evaluate(()=>Descent.snapshot());
async function open(opts={}){
  const context=await browser.newContext({viewport:opts.viewport||{width:1440,height:900},reducedMotion:opts.reduced?'reduce':'no-preference',hasTouch:opts.mobile||false,isMobile:opts.mobile||false});
  if(opts.fixtures)await context.route('**/js/*-room.js?*',r=>{const id=ids.find(id=>new URL(r.request().url()).pathname.endsWith('/'+id+'-room.js'));return id?r.fulfill(opts.fixtures==='missing'?{status:404,body:'Deliberately unavailable in this test'}:{contentType:'text/javascript',body:fixture(id)}):r.continue();});
  await context.addInitScript(({noGPU})=>{
    if(noGPU)Object.defineProperty(navigator,'gpu',{value:undefined});
    const request=window.requestAnimationFrame,cancel=window.cancelAnimationFrame;window.__rafPending=new Set();
    window.requestAnimationFrame=fn=>{let id;id=request(t=>{__rafPending.delete(id);fn(t)});__rafPending.add(id);return id;};
    window.cancelAnimationFrame=id=>{__rafPending.delete(id);cancel(id);};
  },{noGPU:!!opts.noGPU});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404')&&!m.text().includes('ERR_FAILED')&&!m.text().includes('ERR_CONNECTION'))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/descent-lab.html`);
  await page.waitForFunction(()=>window.Descent&&document.getElementById('descent').getAttribute('aria-busy')==='false');
  return{context,page};
}
async function screenshot(page,name){
  await page.locator('#descent-view').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>!Descent.snapshot().offscreen);
  // A paused room selection can finish initialization before the preceding
  // presentation fence's JS callback. Capture the current room after that
  // fence, rather than racing the host's intentional queue guard.
  await page.evaluate(async()=>{const d=window.__descentTest?.device;if(!d||Descent.snapshot().deviceLost)return;await d.queue.onSubmittedWorkDone();while(Descent.snapshot().gpuQueuePending)await new Promise(r=>setTimeout(r,0));__descentTest.draw();await d.queue.onSubmittedWorkDone();});
  const file=path.join(output,name+'.png');await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);
}
async function pause(page){if(!(await snap(page)).paused)await page.locator('#descent-pause').click();}
async function speed(page,rate){for(let i=0;i<3&&(await snap(page)).playbackRate!==rate;i++)await page.locator('#descent-speed').click();assert.equal((await snap(page)).playbackRate,rate);}
async function fit(page){const g=await page.evaluate(()=>({width:document.documentElement.scrollWidth,view:innerWidth,buttons:[...document.querySelectorAll('.descent-toolbar button, .descent-toolbar select')].map(e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height,right:r.right};})}));assert.ok(g.width<=g.view+1,JSON.stringify(g));for(const b of g.buttons){assert.ok(b.width>=44&&b.height>=44);assert.ok(b.right<=g.view+1);}}
async function stable(page,field='roomTicks') {const a=(await snap(page))[field];await page.waitForTimeout(160);assert.equal((await snap(page))[field],a);}
async function renderTiming(page){return page.evaluate(async()=>{
  const {device,manager}=__descentTest;const stepCpu=[],stepFence=[];for(let i=0;i<90;i++){await device.queue.onSubmittedWorkDone();const a=performance.now();manager.step(i/60);stepCpu.push(performance.now()-a);await device.queue.onSubmittedWorkDone();stepFence.push(performance.now()-a);}
  const times=[],fences=[];
  let query,resolve,read;
  if(device.features.has('timestamp-query')) {query=device.createQuerySet({type:'timestamp',count:2});resolve=device.createBuffer({size:256,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});read=device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});}
  try{
    for(let i=0;i<90;i++){
      await device.queue.onSubmittedWorkDone();const encoder=device.createCommandEncoder();
      const facade=query?new Proxy(encoder,{get(t,k){if(k==='beginRenderPass')return d=>t.beginRenderPass({...d,timestampWrites:{querySet:query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}});const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}}):encoder;
      const before=performance.now();manager.render(facade,1);if(query){encoder.resolveQuerySet(query,0,2,resolve,0);encoder.copyBufferToBuffer(resolve,0,read,0,16);}device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();fences.push(performance.now()-before);
      if(query){await read.mapAsync(GPUMapMode.READ);const a=new BigUint64Array(read.getMappedRange());times.push(Number(a[1]-a[0])/1e6);read.unmap();}
    }
  }finally{query?.destroy();resolve?.destroy();read?.destroy();}
  const stats=a=>{a.sort((x,y)=>x-y);return{samples:a.length,medianMs:a[Math.floor(a.length*.5)]??null,p95Ms:a[Math.floor(a.length*.95)]??null};};
  return{simulationCallCpu:stats(stepCpu),simulationQueueFenceLatency:stats(stepFence),roomRenderGpuTimestamps:stats(times),renderQueueFenceLatency:stats(fences),timestampSupported:!!query,snapshot:Descent.snapshot()};
});}
async function displayTiming(page){return page.evaluate(async()=>{
  const {device,manager}=__descentTest;if(!device.features.has('timestamp-query'))return{available:false};
  const query=device.createQuerySet({type:'timestamp',count:2}),resolve=device.createBuffer({size:256,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),read=device.createBuffer({size:16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  const original=device.createCommandEncoder.bind(device),values=[];
  device.createCommandEncoder=d=>{const e=original(d);return new Proxy(e,{get(t,k){if(k==='beginRenderPass')return desc=>t.beginRenderPass(desc.colorAttachments[0].view===manager.active?.view?desc:{...desc,timestampWrites:{querySet:query,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}});if(k==='finish')return()=>{t.resolveQuerySet(query,0,2,resolve,0);t.copyBufferToBuffer(resolve,0,read,0,16);return t.finish();};const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;}});};
  try{for(let i=0;i<60;i++){__descentTest.draw();await device.queue.onSubmittedWorkDone();await read.mapAsync(GPUMapMode.READ);const t=new BigUint64Array(read.getMappedRange());values.push(Number(t[1]-t[0])/1e6);read.unmap();}values.sort((a,b)=>a-b);return{available:true,samples:values.length,medianMs:values[30],p95Ms:values[57],method:'GPU timestamps around final Reinhard/sRGB pass, includes editorial fade multiply'};}
  finally{device.createCommandEncoder=original;query.destroy();resolve.destroy();read.destroy();}
});}
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',args:['--enable-unsafe-webgpu']});
  report.browser=await browser.version();
  for(const id of ids){const file=path.join(root,'js',id+'-room.js');report.routeModules[id]=fs.existsSync(file)?'present':'missing';}
  const real=await open();const p=real.page;await p.waitForTimeout(4500);
  const start=await snap(p);assert.equal(start.deviceLost,false);assert.ok(start.room,start.roomId+' not initialized');
  if(start.roomId==='descent-bootstrap'){
    assert.equal(start.integration.complete,false);await p.waitForTimeout(1200);assert.ok((await snap(p)).roomTicks>start.roomTicks);await pause(p);await stable(p);
    const gpu=await p.evaluate(()=>Descent.debugReadback());const relative=gpu.values.map((x,i)=>Math.abs(x-gpu.cpuReference[i])/Math.max(1e-7,Math.abs(gpu.cpuReference[i])));assert.ok(Math.max(...relative)<3e-5,JSON.stringify(relative));report.numerical={gpuVsCpuMaxRelativeError:Math.max(...relative),points:gpu.points.length};
    pass('Interim analytic model renders and GPU density matches CPU within 3e-5');
    await screenshot(p,'hydrogen-startup');
    for(const [phase,name]of [[18,'hydrogen-developing'],[36,'hydrogen-beat-return'],[108,'hydrogen-three-phrases']]){
      await p.evaluate(t=>{const a=__descentTest.manager.active;a.room.restoreAnalyticTime({stepCount:t*60,elapsedSeconds:t});a.ticks=t*60;__descentTest.draw();},phase);await screenshot(p,name);
    }
    report.performance=await renderTiming(p);
    await p.locator('#descent-instruments').click();assert.equal(await p.locator('#descent-panel').isVisible(),true);await screenshot(p,'hydrogen-instruments');
    await p.selectOption('#descent-room','soap-film');await p.waitForFunction(()=>!Descent.snapshot().loading);assert.equal((await snap(p)).room,null);assert.match(await p.locator('#descent-message-detail').textContent(),/soap-film-room/);pass('Missing live room has a factual per-room error and no substitute physics');
    await p.evaluate(()=>Descent.selectRoom('descent-bootstrap'));await p.waitForFunction(()=>!Descent.snapshot().loading);await p.locator('#descent-instruments').click();
  }
  if(start.integration.modulesReady===4){
    report.liveRooms={};
    for(const id of ids){
      await pause(p);await p.evaluate(id=>Descent.selectRoom(id),id);const loaded=await snap(p);assert.ok(loaded.room,JSON.stringify(loaded.initializationError));
      await p.evaluate(()=>__descentTest.draw());await screenshot(p,`live-${id}-startup`);
      const state=await snap(p);assert.equal(state.room.id,id);assert.ok(state.room.numericalStepCount>=0);assert.equal(state.resources.liveRooms,1);report.liveRooms[id]={startup:state};
      if(id==='hydrogen-exactly'){assert.equal(state.room.mode,'spectral');assert.ok(state.room.representativeScaleMeters<2e-9);assert.match(await p.locator('#descent-scale').textContent(),/n_max/);}
      if(id==='hydrogen-exactly'){
        await p.locator('#descent-instruments').click();await p.selectOption('#descent-hydrogen-mode','revival');await p.waitForFunction(()=>!Descent.snapshot().loading&&Descent.snapshot().room?.mode==='revival');
        const variant=await snap(p);assert.ok(variant.room.representativeScaleMeters>4e-8&&variant.room.representativeScaleMeters<5e-8);assert.match(await p.locator('#descent-scale').textContent(),/47\.6/);assert.match(await p.locator('#descent-diagnostics').textContent(),/density|Density/);report.hydrogenVariant={room:variant.room,scale:await p.locator('#descent-scale').textContent()};await screenshot(p,'live-hydrogen-revival-option');
        await p.selectOption('#descent-hydrogen-mode','spectral');await p.waitForFunction(()=>!Descent.snapshot().loading&&Descent.snapshot().room?.mode==='spectral');await p.locator('#descent-instruments').click();pass('Explicit Rydberg option uses its actual 47.6 nm scale and documented density color meaning');
      }
      report.liveRooms[id].timings=await renderTiming(p);
      const result=await p.evaluate(async()=>{const r=await Descent.debugReadback();const s=Descent.snapshot();if(s.roomId==='hydrogen-exactly'){return{finite:r.finite,mass:r.spatialCapturedMass,errors:r.probes.map(p=>Math.abs(p.gpu.rho-p.cpu.rho)/Math.max(1e-10,Math.abs(p.cpu.rho)))};}if(s.roomId==='negative-temperature'){return{diagnostics:r.diagnostics,grid:r.grid,steps:r.steps};}if(s.roomId==='soap-film'){return{diagnostics:r.diagnostics,events:r.events};}return{group:r.groupSize,extent:r.extent,snapshot:r.snapshot,links:r.links.length};});
      report.liveRooms[id].readback=result;
      if(id==='hydrogen-exactly'){assert.equal(result.finite,true);assert.ok(Math.max(...result.errors)<.002);}
      if(id==='qcd-lava-lamp'){assert.equal(result.group,3);assert.ok(result.snapshot.unitarityError<.001);}
      pass(`Live ${id} initialization, rgba16float render, diagnostics and readback`);
    }
    assert.equal((await snap(p)).integration.complete,true);
    report.hostDisplayGpu=await displayTiming(p);
    report.simultaneousAllocation=await p.evaluate(async()=>{
      const {ResourceLedger}=await import('/js/descent-host.js');const ledgers=[],rooms=[],targets=[];
      try{for(const id of ['hydrogen-exactly','qcd-lava-lamp']){const ledger=new ResourceLedger();ledgers.push(ledger);const mod=await __descentTest.registry.load(id);const room=await mod.createRoom({device:ledger.deviceFacade(__descentTest.device),seed:'1234abcd1234abcd',quality:'medium',assetBaseURL:__descentTest.registry.entries.get(id).assetBaseURL});rooms.push(room);room.resize({width:640,height:360,dpr:1});targets.push(__descentTest.device.createTexture({size:[640,360],format:'rgba16float',usage:GPUTextureUsage.RENDER_ATTACHMENT}));}
        await __descentTest.device.queue.onSubmittedWorkDone();return{fits:true,roomAllocations:ledgers.map(l=>l.snapshot()),extraTargetsBytes:2*640*360*8,policy:'Allocation fit only, not concurrent solver performance; host keeps one active room'};
      }finally{rooms.forEach(r=>r.dispose());ledgers.forEach(l=>l.dispose());targets.forEach(t=>t.destroy());__descentTest.draw();}
    });pass('Largest adjacent room pair allocates together on this adapter; shared device remains usable after disposal');
    report.performance=report.liveRooms;
    await p.evaluate(()=>Descent.selectRoom('soap-film'));await p.waitForFunction(()=>!Descent.snapshot().loading);
  }
  if(process.env.DESCENT_WHOLE_ROUTES==='1'&&start.integration.modulesReady===4){
    report.realRoutes=[];
    await p.locator('#descent-instruments').click();await p.selectOption('#descent-quality','low');await p.waitForFunction(()=>!Descent.snapshot().loading);
    await p.evaluate(()=>__descentTest.seek(0));
    for(let route=0;route<2;route++)for(let i=0;i<4;i++){
      const id=ids[i];let state=await snap(p);assert.equal(state.roomId,id,JSON.stringify(state.initializationError));assert.ok(state.room);
      await p.evaluate(()=>__descentTest.advance(60*80));await screenshot(p,`real-route-${route+1}-${id}-developing`);
      await p.evaluate(()=>__descentTest.advance(60*90));await p.evaluate(async()=>{await Descent.debugReadback();__descentTest.updateUI(true);});await screenshot(p,`real-route-${route+1}-${id}-dwell`);
      state=await snap(p);assert.equal(state.roomId,id);report.realRoutes.push({route:route+1,id,dwell:state.clock.age,roomTicks:state.roomTicks,room:state.room,resources:state.resources,cpuCosts:state.roomCpuCosts[id]});
      // Finish actual fades/rest and any measured event extension. Each batch
      // preserves dt and model coefficients; GPU queue fences bound test work.
      let departing=state,ruptureCaptured=false;
      for(let j=0;j<70&&(await snap(p)).roomId===id;j++){
        departing=await snap(p);
        if(id==='soap-film'&&!ruptureCaptured&&departing.room?.diagnostics?.state==='rupturing'){await screenshot(p,`real-route-${route+1}-${id}-rupturing`);ruptureCaptured=true;}
        await p.evaluate(()=>__descentTest.advance(60));
      }
      report.realRoutes.at(-1).departure={clock:departing.clock,room:departing.room};
      const next=await snap(p);assert.equal(next.roomId,ids[(i+1)%4]);assert.ok(next.room,JSON.stringify(next.initializationError));assert.ok(next.resources.liveRooms===1);
      for(const r of next.resources.retired){assert.equal(r.buffers,0);assert.equal(r.textures,0);assert.equal(r.querySets,0);assert.equal(r.created,r.destroyed);}
      pass(`Real route ${route+1}, ${id}: full dwell, fixed solver steps, transition and disposal`);
    }
    assert.equal((await snap(p)).clock.cycle,2);pass('Two entire real four-room routes complete at low quality');
    await p.evaluate(()=>__descentTest.seek(176));await screenshot(p,'live-dark-transition');
    await p.evaluate(()=>Descent.selectRoom('soap-film'));await p.locator('#descent-instruments').click();
  }
  if(start.integration.modulesReady===4){
    const playback=await open(),sp=playback.page;await pause(sp);
    await sp.locator('#descent-instruments').click();await sp.selectOption('#descent-quality','low');await sp.waitForFunction(()=>!Descent.snapshot().loading);await sp.locator('#descent-instruments').click();
    const watch=async(id,rate)=>{
      await pause(sp);await sp.evaluate(id=>Descent.selectRoom(id),id);await speed(sp,rate);await stable(sp);
      assert.equal((await snap(sp)).paused,true,'Changing speed must preserve Pause');
      const before=await snap(sp);await sp.locator('#descent-pause').click();const started=Date.now();await sp.waitForTimeout(1500);await pause(sp);await sp.waitForFunction(()=>!Descent.snapshot().roomWorkPending);
      const after=await snap(sp);return{seconds:(Date.now()-started)/1000,ticks:after.roomTicks-before.roomTicks,watchingSeconds:after.clock.total-before.clock.total,room:after.room,resources:after.resources};
    };
    const normal=await watch('hydrogen-exactly',1),fast=await watch('hydrogen-exactly',12);
    assert.ok(fast.ticks>normal.ticks*2,`Fast ${fast.ticks}, normal ${normal.ticks}`);
    assert.ok(Math.abs(fast.watchingSeconds-fast.ticks/60)<1e-7);assert.equal(fast.room.parameterValues.atomicUnitsPerDisplaySecond,normal.room.parameterValues.atomicUnitsPerDisplaySecond);
    report.playback={normalHydrogen:normal,fastHydrogen:fast,rooms:{}};
    for(const id of ['soap-film','negative-temperature','qcd-lava-lamp']){
      const r=await watch(id,12);assert.ok(r.ticks>0);assert.ok(Math.abs(r.watchingSeconds-r.ticks/60)<1e-7);
      if(id==='soap-film')assert.ok(Math.abs(r.room.simulationTime-r.ticks/60)<.041);
      if(id==='negative-temperature')assert.ok(Math.abs(r.room.simulationTime-r.ticks/60*r.room.parameters.solverUnitsPerSecond)<.011);
      if(id==='qcd-lava-lamp')assert.equal(r.room.numericalStepCount,256+Math.floor((r.ticks+1e-7)/30),'Fast batches must preserve two Markov sweeps per model second');
      report.playback.rooms[id]=r;
    }
    pass('Visible 12x playback advances every real model with fixed steps; asynchronous SU(3) sweeps retain their rate');
    await sp.evaluate(()=>Descent.selectRoom('soap-film'));const cycle=(await snap(sp)).clock.cycle;
    for(const id of ['negative-temperature','hydrogen-exactly','qcd-lava-lamp','soap-film']){
      await sp.locator('#descent-next').click();await sp.waitForFunction(id=>!Descent.snapshot().loading&&Descent.snapshot().roomId===id,id);const state=await snap(sp);assert.equal(state.paused,true);assert.equal(state.automatic,false);assert.equal(state.roomTicks,0);
    }
    assert.equal((await snap(sp)).clock.cycle,cycle+1);
    await sp.reload();await sp.waitForFunction(()=>window.Descent&&!Descent.snapshot().loading&&Descent.snapshot().room);assert.equal((await snap(sp)).playbackRate,12);assert.equal((await snap(sp)).paused,true);await stable(sp);
    pass('Next room previews all four models, preserves Pause and auto choice, and saved speed survives reload');
    for(const [width,height]of [[1440,900],[390,844],[844,390]]){
      await sp.setViewportSize({width,height});await sp.waitForTimeout(100);await fit(sp);await screenshot(sp,`playback-controls-${width}x${height}`);
    }
    await sp.locator('#descent-speed').focus();await sp.keyboard.press('Enter');assert.equal((await snap(sp)).playbackRate,1);await sp.keyboard.press('Space');assert.equal((await snap(sp)).playbackRate,4);await stable(sp);
    pass('Speed control supports keyboard input and 44px controls fit desktop, portrait and landscape');
    await playback.context.close();
  }
  await pause(p);
  for(const [width,height]of [[1440,900],[390,844],[844,390]]){
    await p.setViewportSize({width,height});await p.waitForTimeout(100);await fit(p);await screenshot(p,`viewport-${width}x${height}`);
    if(start.integration.modulesReady===4)for(const id of ids){await p.evaluate(id=>Descent.selectRoom(id),id);await p.evaluate(()=>__descentTest.draw());await fit(p);await stable(p);await screenshot(p,`layout-${id}-${width}x${height}`);}
  }
  if(start.integration.modulesReady===4){await p.evaluate(()=>Descent.selectRoom('soap-film'));pass('Every real room fits all three viewports and stays paused during resize and selection');}
  await p.evaluate(()=>{document.getElementById('descent').requestFullscreen=()=>Promise.reject(Error('test fullscreen fallback'));});await p.locator('#descent-fullscreen').click();await p.waitForFunction(()=>document.getElementById('descent').classList.contains('descent-pseudo-fs'));await fit(p);await p.keyboard.press('Escape');assert.equal(await p.locator('#descent').evaluate(e=>e.classList.contains('descent-pseudo-fs')),false);
  await p.evaluate(()=>{delete document.getElementById('descent').requestFullscreen});await p.locator('#descent-fullscreen').click();await p.waitForFunction(()=>!!document.fullscreenElement||document.getElementById('descent').classList.contains('descent-pseudo-fs'));await fit(p);await p.locator('#descent-fullscreen').click();pass('Desktop, portrait, landscape, native fullscreen and fallback fullscreen fit');
  await p.locator('#descent-pause').click();await p.waitForTimeout(100);
  await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await stable(p);assert.equal(await p.evaluate(()=>__rafPending.size),0);
  await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await p.waitForTimeout(100);assert.ok((await snap(p)).roomTicks>0);
  await p.evaluate(()=>document.getElementById('descent-view').style.transform='translateY(-300vh)');await p.waitForFunction(()=>Descent.snapshot().offscreen);await stable(p);assert.equal(await p.evaluate(()=>__rafPending.size),0);await p.evaluate(()=>document.getElementById('descent-view').style.transform='');await p.waitForFunction(()=>!Descent.snapshot().offscreen);
  await pause(p);await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await stable(p);assert.equal((await snap(p)).paused,true);pass('Hidden and offscreen rooms stop stepping; manual pause survives return');
  await p.locator('#descent-instruments').click();await p.route('https://api.drand.sh/**',r=>r.abort());const beforeSeed=(await snap(p)).seed.seed;await p.locator('#descent-beacon').click();await p.waitForFunction(()=>!document.getElementById('descent-beacon').disabled);assert.equal((await snap(p)).seed.seed,beforeSeed);pass('Beacon network failure keeps the existing seed and model');
  const verified=await p.evaluate(async()=>{const {ROUND_42,verifyBeaconSeed}=await import('/js/descent-seed.js');const good=await verifyBeaconSeed(ROUND_42);const signature='85'+ROUND_42.signature.slice(2),bytes=Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)),hash=await crypto.subtle.digest('SHA-256',bytes),randomness=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');let rejected=false;try{await verifyBeaconSeed({...ROUND_42,signature,randomness});}catch(_){rejected=true;}return{round:good.round,rejected};});assert.equal(verified.round,42);assert.equal(verified.rejected,true);pass('Browser BLS verification accepts round 42 and rejects a rehashed altered signature');
  if(start.integration.modulesReady===4){await p.evaluate(()=>Descent.selectRoom('negative-temperature'));await p.evaluate(async()=>{await __descentTest.advance(120);__descentTest.save();});}
  const pauseState=await snap(p);
  const probes=()=>p.evaluate(async()=>{const r=await Descent.debugReadback();return r?.field?Array.from(r.field).filter((_,i)=>i%257===0):null;});
  const beforeProbes=await probes();await p.reload();await p.waitForFunction(()=>window.Descent&&!Descent.snapshot().loading&&Descent.snapshot().room);
  const restored=await snap(p);assert.equal(restored.paused,true);assert.equal(restored.seed.seed,pauseState.seed.seed);assert.equal(restored.clock.total,pauseState.clock.total);
  if(pauseState.roomId==='descent-bootstrap')assert.equal(restored.roomTicks,pauseState.roomTicks);
  else {assert.equal(restored.replayRemaining,pauseState.roomTicks);await stable(p);await p.evaluate(n=>__descentTest.advance(n),restored.replayRemaining);const replayed=await snap(p);assert.equal(replayed.roomTicks,pauseState.roomTicks);assert.equal(replayed.replayRemaining,0);assert.equal(replayed.clock.total,pauseState.clock.total);assert.equal(replayed.replayValidation.matches,true);const afterProbes=await probes();const max=beforeProbes?Math.max(...beforeProbes.map((v,i)=>Math.abs(v-afterProbes[i]))):null;if(max!==null)assert.ok(max<1e-4,`Same-adapter replay error ${max}`);report.seedReplay={room:replayed.roomId,hostTicks:replayed.roomTicks,maxProbeAbsoluteError:max,tolerance:1e-4};}
  pass('Reload preserves pause and seed; bounded fixed-step replay restores a real room without advancing the piece clock');
  if(start.integration.modulesReady===4){
    await p.evaluate(()=>__descentTest.save());
    await p.addInitScript(()=>{const s=JSON.parse(localStorage.getItem('descent-v1'));if(s?.visit){s.visit.numericalStepCount++;localStorage.setItem('descent-v1',JSON.stringify(s));}});
    await p.reload();await p.waitForFunction(()=>window.Descent&&!Descent.snapshot().loading&&Descent.snapshot().room);
    await p.evaluate(n=>__descentTest.advance(n),(await snap(p)).replayRemaining);assert.equal((await snap(p)).replayValidation.matches,false);assert.match((await snap(p)).replayMeaning,/new seeded replay/);
    pass('A mismatched saved solver count is reported as a new seeded replay, not a restored GPU state');
  }
  await p.evaluate(()=>__descentTest.lose());await p.waitForFunction(()=>Descent.snapshot().deviceLost);assert.match(await p.locator('#descent-message-title').textContent(),/device was lost/);await screenshot(p,'device-loss');pass('Device loss releases rooms and reports restart semantics');await real.context.close();

  const fixtures=await open({fixtures:true});const f=fixtures.page;await pause(f);await speed(f,12);await f.evaluate(()=>__descentTest.seek(177));
  const transitionStarted=Date.now();await f.locator('#descent-pause').click();await f.waitForFunction(()=>!Descent.snapshot().loading&&Descent.snapshot().roomId==='negative-temperature');await pause(f);assert.ok(Date.now()-transitionStarted<2500,'12x must advance the automatic fade/rest/selection');
  pass('12x playback advances automatic fades, dark rests and room selection');
  await speed(f,1);await f.evaluate(()=>__descentTest.seek(5));
  for(let cycle=0;cycle<2;cycle++)for(let i=0;i<4;i++){
    const state=await snap(f);assert.equal(state.roomId,ids[i]);assert.equal(state.resources.liveRooms,1);
    await f.evaluate(()=>__descentTest.advance(60*170));assert.ok((await snap(f)).roomTicks>0);await screenshot(f,`fixture-route-${cycle+1}-${ids[i]}`);
    const remainder=180-(await snap(f)).clock.age;await f.evaluate(n=>__descentTest.advance(Math.ceil(n*60)),remainder);
    await f.waitForFunction(()=>!Descent.snapshot().loading);assert.ok((await snap(f)).resources.liveRooms<=1);
  }
  assert.equal((await snap(f)).clock.cycle,2);assert.equal((await snap(f)).integration.complete,true);
  for(const r of (await snap(f)).resources.retired){assert.equal(r.buffers,0);assert.equal(r.textures,0);assert.equal(r.created,r.destroyed);}
  for(let i=0;i<16;i++)await f.evaluate(id=>Descent.selectRoom(id),ids[i%4]);const repeat=await snap(f);assert.equal(repeat.resources.room.buffers,1);assert.equal(repeat.resources.room.bytes,16);assert.ok(await f.evaluate(()=>__rafPending.size<=1));
  await f.evaluate(()=>__descentTest.seek(176));await f.evaluate(()=>__descentTest.draw());await screenshot(f,'fixture-editorial-transition');
  await f.evaluate(()=>Descent.dispose());assert.equal(await f.evaluate(()=>__rafPending.size),0);assert.equal((await snap(f)).resources.liveRooms,0);
  const stopped=await snap(f);await f.locator('#descent-pause').click();await f.locator('#descent-speed').click();await f.locator('#descent-next').click();await f.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});const inert=await snap(f);assert.equal(inert.paused,stopped.paused);assert.equal(inert.playbackRate,stopped.playbackRate);assert.equal(inert.roomId,stopped.roomId);assert.equal(inert.hidden,stopped.hidden);assert.equal(await f.evaluate(()=>__rafPending.size),0);
  pass('Two whole fixture routes and sixteen switches retain one room, free tracked resources, and abort input/visibility listeners');await fixtures.context.close();
  const reduced=await open({reduced:true});assert.equal((await snap(reduced.page)).paused,true);assert.equal((await snap(reduced.page)).automatic,false);assert.equal((await snap(reduced.page)).playbackRate,1);await stable(reduced.page);await reduced.page.locator('#descent-pause').click();await reduced.page.waitForTimeout(120);assert.ok((await snap(reduced.page)).roomTicks>0);pass('Reduced motion starts still and Play explicitly begins stepping');await reduced.context.close();
  const fallback=await open({noGPU:true,viewport:{width:390,height:844},mobile:true});assert.equal(await fallback.page.locator('#descent-still').isVisible(),true);assert.equal(await fallback.page.locator('#descent-pause').isDisabled(),true);assert.equal(await fallback.page.locator('#descent-speed').isDisabled(),true);assert.equal(await fallback.page.locator('#descent-next').isDisabled(),true);await fit(fallback.page);await screenshot(fallback.page,'no-webgpu-calculated-still');pass('No WebGPU presents the labeled CPU-calculated still');await fallback.context.close();
  const missing=await open({fixtures:'missing',reduced:true});const m=missing.page;assert.equal((await snap(m)).roomId,'descent-bootstrap');assert.equal((await snap(m)).integration.complete,false);
  const density=await m.evaluate(()=>Descent.debugReadback());assert.ok(Math.max(...density.values.map((v,i)=>Math.abs(v-density.cpuReference[i])/Math.max(1e-7,Math.abs(density.cpuReference[i]))))<3e-5);
  await m.locator('#descent-instruments').click();await m.selectOption('#descent-room','soap-film');await m.waitForFunction(()=>!Descent.snapshot().loading);assert.equal((await snap(m)).room,null);assert.match(await m.locator('#descent-message-detail').textContent(),/soap-film-room/);await screenshot(m,'missing-module-error');pass('Absent route modules show their exact paths; interim GPU density matches its CPU model');
  if(report.routeModules['soap-film']==='present'){await missing.context.unroute('**/js/*-room.js?*');await m.locator('#descent-restart').click();await m.waitForFunction(()=>!Descent.snapshot().loading&&Descent.snapshot().room?.id==='soap-film');pass('Restart retries a failed import and loads the real module when it becomes available');}
  await missing.context.close();
  assert.deepEqual(errors,[]);pass('No unexpected script, shader or GPU validation errors');
}finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
