// Real browser acceptance: native ballast, cable coupling and repeated railway trips.
// The harness owns one Chrome for Testing browser and leaves its simulation clock alone.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,launchOptions}=require('./under-street/browser-support.cjs');
const root=path.resolve(__dirname,'..');
const output=process.env.DUMP || '/tmp/ballast-railway-review';
fs.mkdirSync(output,{recursive:true});
const reports=[],samples=[],errors=[];
const server=http.createServer((request,response)=>{
  try{
    const file=path.resolve(root,'.'+new URL(request.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep))return response.writeHead(403).end();
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
    response.writeHead(200,{'Content-Type':mime[path.extname(file)] || 'application/octet-stream'}).end(fs.readFileSync(file));
  }catch{response.writeHead(404).end();}
});

let browser,page,prefix='desktop';
async function reading(){
  return page.evaluate(()=>{
    const T=__toy,state=T.machineState(),r=state?.definition.railwayReading;
    return {railway:r || null,spec:state?.definition.railway || state?.definition.ballastRailway,nativeClock:T.liquid().simulationClock,boundary:T.nativeBoundary()?.stats(),
      bodies:T.bodies().map(b=>({x:b.cx,y:b.cy,finite:[...b.px,...b.py,...b.ox,...b.oy].every(Number.isFinite)})),
      status:document.getElementById('toy-status').textContent,paused:T.stats().paused,
      error:T.instruments().error || null,gpuError:window.__railwayGpuErrors || []};
  });
}
function healthy(r){
  assert(r.railway,'railway publishes its measured state');
  assert.equal(r.railway.error,null,'railway runtime has no error');
  assert.equal(r.error,null,'host has no error');
  assert.equal(r.boundary.error,null,'native water has no error');
  assert.deepEqual(r.gpuError,[],'GPU has no uncaptured errors');
  assert(r.bodies.every(b=>b.finite),'all carriage nodes remain finite');
  assert.equal(r.railway.positions.length,2,'both carriages remain present');
  assert(r.railway.positions.every(p=>Number.isFinite(p.x+p.y+p.s)),'both carriage positions are finite');
  const spec=r.spec,travel=Math.hypot(spec.dx,spec.dy);
  assert(Math.abs(r.railway.positions[0].s+r.railway.positions[1].s-travel)<.01,'the two cable lengths sum to the declared rail travel');
  r.railway.positions.forEach((p,i)=>{
    assert(Math.abs(p.x-(spec.starts[i].x+spec.dx*p.s/travel))<.01 && Math.abs(p.y-(spec.starts[i].y+spec.dy*p.s/travel))<.01,'carriage center stays on its inclined rail');
    assert(Math.hypot(p.x-r.railway.tanks[i].x,p.y-r.railway.tanks[i].y)<.01,'the actual water tank moves with the carriage');
  });
  assert(Math.abs(r.railway.cableError)<.01,'the common cable retains its length');
  assert.equal(r.boundary.present+r.boundary.parked,r.boundary.count,'the native inventory is conserved');
  assert(!r.status.includes('Waiting for pressure'),'status describes the railway');
}
async function waitFor(predicate,label,maxSeconds=90){
  const initial=await reading(),deadline=Date.now()+240000;
  let logAt=0;
  while(Date.now()<deadline){
    const r=await reading();healthy(r);samples.push({view:prefix,...r});
    if(predicate(r))return r;
    assert(r.nativeClock-initial.nativeClock<maxSeconds,label+' within '+maxSeconds+' native seconds: '+JSON.stringify(r.railway));
    if(Date.now()>logAt){console.log(prefix,label,JSON.stringify(r.railway));logAt=Date.now()+10000;}
    await page.waitForTimeout(125);
  }
  throw Error(label+' stalled: '+JSON.stringify(await reading()));
}
async function advance(seconds){
  const start=(await reading()).nativeClock;
  return waitFor(r=>r.nativeClock>=start+seconds,'advance '+seconds,seconds+2);
}
async function capture(name){
  const r=await reading();healthy(r);reports.push({name:prefix+'-'+name,...r});
  await page.screenshot({path:path.join(output,prefix+'-'+name+'.png')});
  return r;
}
async function ready(){
  await page.waitForFunction(()=>window.__toy?.machineState()?.ready && __toy.nativeBoundary()?.stats().ready && !!__toy.machineState().definition.railwayReading,undefined,{timeout:30000});
  await page.evaluate(()=>{
    window.__railwayGpuErrors=[];
    __toy.liquid().device.addEventListener('uncapturederror',event=>__railwayGpuErrors.push(event.error.message));
  });
}
async function control(touch=false,key){
  const button=page.locator('.toy-scene-action[data-control="primary"]');
  await button.waitFor({state:'visible'});
  const rect=await button.boundingBox(),view=page.viewportSize();
  assert(rect.width>=44 && rect.height>=44,'supply has a usable pointer target');
  assert(rect.x>=0 && rect.y>=0 && rect.x+rect.width<=view.width+.5 && rect.y+rect.height<=view.height+.5,'supply target fits in viewport');
  if(key){await button.focus();await page.keyboard.press(key);}
  else if(touch)await button.tap();
  else await button.click();
}
async function residentWater(){
  return page.evaluate(async()=>{
    const T=__toy,L=T.liquid(),n=T.stats().allocation,size=n*36;
    const read=L.device.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{
      const encoder=L.device.createCommandEncoder();
      encoder.copyBufferToBuffer(L.buf.pos,0,read,0,n*16);
      encoder.copyBufferToBuffer(L.buf.flag,0,read,n*16,n*4);
      encoder.copyBufferToBuffer(L.toyNativeExtension.slotsBuffer,0,read,n*20,n*16);
      L.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
      const raw=read.getMappedRange(),p=new Float32Array(raw,0,n*4),f=new Uint32Array(raw,n*16,n),slots=new Uint32Array(raw,n*20,n*4);
      const particles=[],owners=[0,0,0];let invalid=0;
      for(let i=0;i<n;i++){
        if(!Number.isFinite(p[i*4]+p[i*4+1]+p[i*4+2]+p[i*4+3]))invalid++;
        owners[slots[i*4]]=(owners[slots[i*4]] || 0)+1;
        if((f[i]&128)===0 && (f[i]&3)===0)particles.push({id:i,x:p[i*4],y:p[i*4+1],vx:p[i*4+2],vy:p[i*4+3]});
      }
      return {particles,owners,invalid,total:n,clock:L.simulationClock,railway:T.machineState().definition.railwayReading};
    }finally{read.unmap();read.destroy();}
  });
}
async function verifyNativeBallast(name){
  await page.evaluate(()=>__toy.pause(true));
  // Complete the already submitted last frame before comparing its readback.
  await page.evaluate(()=>__toy.liquid().queue.onSubmittedWorkDone());await page.waitForTimeout(150);
  const r=await residentWater();
  assert.equal(r.invalid,0,'all resident water values are finite');
  assert.equal(r.owners.reduce((sum,n)=>sum+n,0),r.total,'every resident parcel has exactly one owner');
  // The tank bounds come from declared rigid geometry; counts are read directly
  // from the resident GPU particles, independently of the ballast reducer.
  const tanks=r.railway.tanks;
  assert.equal(tanks.length,2,'both actual tank interiors are exposed');
  const counts=tanks.map(t=>{const b=t.interior;return r.particles.filter(p=>p.x>b.x && p.x<b.x+b.width && p.y>b.y && p.y<b.y+b.height).length;});
  for(let i=0;i<2;i++){
    const expected=r.railway.waterCounts[i],tolerance=Math.max(35,.15*Math.max(counts[i],expected));
    assert(Math.abs(counts[i]-expected)<=tolerance,'reported ballast matches independent resident water count: '+JSON.stringify({counts,reported:r.railway.waterCounts}));
    assert(Math.abs(r.railway.masses[i]-(r.railway.dryMass+expected*r.railway.parcelMass))<1e-6,'carriage mass comes from the measured water and declared dry mass');
  }
  assert(counts.some(n=>n>100),'a moving car really contains substantial native water');
  reports.push({name:prefix+'-'+name+'-native',counts,reported:r.railway.waterCounts,owners:r.owners,total:r.total,clock:r.clock});
  await capture(name);
  const before=await reading();await page.waitForTimeout(250);const after=await reading();
  assert.equal(after.nativeClock,before.nativeClock,'pause freezes the native clock');
  assert.deepEqual(after.bodies,before.bodies,'pause freezes the connected carriages');
  assert.deepEqual(after.railway.positions,before.railway.positions,'pause freezes cable coordinates');
  assert.deepEqual(after.railway.waterCounts,before.railway.waterCounts,'pause freezes ballast');
  await page.evaluate(()=>__toy.pause(false));
  return counts;
}

(async()=>{
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({...launchOptions,args:['--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run']});
    for(const mobile of [false,true]){
      prefix=mobile?'mobile':'desktop';
      const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1440,height:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile,
        ...(mobile?{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}:{})});
      page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=ballast-railway&paused=1`);
      await ready();await page.evaluate(()=>__toy.machine('ballast-railway',{tapEnabled:false}));await ready();
      await page.evaluate(()=>__toy.pause(false));
      const dry=await capture('dry');await advance(3);const dryLater=await capture('dry-still');
      assert.deepEqual(dryLater.railway.waterCounts,[0,0],'dry comparison has no hidden ballast');
      assert.equal(dryLater.railway.trips,0,'empty cars make no trips');
      assert.deepEqual(dryLater.railway.positions,dry.railway.positions,'elapsed time cannot drive an empty railway');
      await control(mobile);
      const first=await waitFor(r=>r.railway.velocity>.5 && r.railway.positions[0].s>20,'first loaded descent');
      assert(first.railway.waterCounts[0]>first.railway.waterCounts[1],'descending first car has the larger water load');
      await verifyNativeBallast('first-descent');
      await waitFor(r=>r.railway.trips>=1,'first station arrival');await capture('first-arrival');
      const back=await waitFor(r=>r.railway.velocity<-.5,'opposite loaded descent');
      assert(back.railway.waterCounts[1]>back.railway.waterCounts[0],'the other water load drives the return');
      await verifyNativeBallast('return-descent');
      const cycles=mobile?1:2;
      const completed=await waitFor(r=>r.railway.cycles>=cycles,cycles+' complete round trips');
      assert(completed.railway.trips>=cycles*2,'every cycle has two completed trips');
      await capture('cycles-complete');
      const liveSamples=samples.filter(s=>s.view===prefix && s.railway.trips>=0);
      assert(liveSamples.some(s=>s.railway.velocity>.5) && liveSamples.some(s=>s.railway.velocity<-.5),'observed actual motion in both directions');
      // Stop the supply during a loaded trip. The carried water finishes that
      // trip, then drains; no fresh upper-tank load can start another one.
      await waitFor(r=>r.railway.phase==='travelling' && Math.abs(r.railway.velocity)>1 && r.railway.departures>completed.railway.departures,'new loaded trip before supply cutoff');
      await control(mobile);
      await waitFor(r=>r.railway.phase==='filling' && !r.railway.tapEnabled && r.railway.waterCounts.every(n=>n<20) && Math.abs(r.railway.velocity)<.01,'water-off stop');
      const stopped=await capture('supply-stopped');await advance(2);const held=await reading();
      assert.equal(held.railway.trips,stopped.railway.trips,'no new trips with the supply off');
      assert.deepEqual(held.railway.positions,stopped.railway.positions,'the empty railway stays at its stops');
      await control(mobile,mobile?null:'Enter');await waitFor(r=>r.railway.trips>held.railway.trips,'restarted supply drives another trip');
      await capture('supply-restarted');
      await page.evaluate(()=>__toy.pause(true));
      const reset=page.getByRole('button',{name:'Restart scene',exact:true});if(mobile)await reset.tap();else await reset.click();
      await ready();const fresh=await capture('reset');
      assert(!fresh.paused,'the shared Restart control resumes playback');
      assert.equal(fresh.railway.trips,0,'restart clears previous station arrivals');
      assert.equal(fresh.railway.cycles,0,'restart clears cycle count');
      assert.deepEqual(fresh.railway.waterCounts,[0,0],'restart restores empty tanks');
      await page.evaluate(()=>__toy.pause(false));
      await page.waitForTimeout(250);assert.deepEqual(errors,[],'no JavaScript errors');
      // machine() exercises lazy scene modules in the same engine. scene()
      // normally navigates to a new document when its native domain changes.
      await page.evaluate(()=>__toy.machine('floating-block'));
      await page.waitForFunction(()=>__toy.machineState()?.ready && __toy.machineState().definition.name==='floating-block',undefined,{timeout:30000});
      assert.equal(await page.evaluate(()=>__toy.machineState().definition.railwayReading || null),null,'another draft has no railway state');
      await page.evaluate(()=>__toy.machine('ballast-railway'));await ready();
      assert(await page.evaluate(()=>!!(__toy.machineState().definition.railway || __toy.machineState().definition.ballastRailway)),'lazy draft loading preserves the railway factory');
      await waitFor(r=>r.railway.velocity>.5,'railway runs after another draft loads');
      await capture('scene-return');
      // A superseded async apparatus build must not install its old runtime
      // over the scene selected immediately afterward.
      await page.evaluate(async()=>{const pending=__toy.machine('ballast-railway');await __toy.machine('floating-block');await pending;});
      await page.waitForFunction(()=>__toy.machineState()?.ready && __toy.machineState().definition.name==='floating-block');
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>__toy.machineState().definition.railwayReading || null),null,'rapid scene change discards the superseded railway');
      await page.evaluate(()=>__toy.machine('ballast-railway'));await ready();
      await page.evaluate(()=>__toy.pause(false));await waitFor(r=>r.railway.velocity>.5,'fresh railway after rapid change');
      await page.evaluate(()=>__toy.scene('falls'));
      await page.waitForFunction(()=>window.__toy?.stats().scene==='falls' && !__toy.stats().loading);
      assert.equal(await page.evaluate(()=>__toy.machineState()),null,'ordinary scene has no railway state');
      await context.close();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: independent native ballast counts, cable constraint, dry control, repeated round trips, stop/start water, pause, restart and scene cleanup with desktop and landscape touch.');
  }finally{
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({reports,samples,errors},null,2));
    if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
