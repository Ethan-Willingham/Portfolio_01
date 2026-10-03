import assert from 'node:assert/strict';
import { AmbientClock, RouteClock, ResourceLedger, ModuleRegistry, RoomManager, ROUTE, FIXED_DT, validateModule, validateSnapshot, scaleLabel, routeCompleteness, deriveRoomSeed } from '../js/descent-host.js';
import { roomPresentation } from '../js/descent-room-adapters.js';
let deviceDestroyed=0,alive=0,targetDestroy=0;
const fakeResource=()=>{alive++;return{destroy(){alive--;},createView(){return {nativeTestView:true};}};};
const device={createBuffer:fakeResource,createTexture:fakeResource,destroy(){deviceDestroyed++;},limits:{maxTextureDimension2D:8192}};
const targets=[];
const targetFactory=()=>{const t={format:'rgba16float',destroy(){targetDestroy++;},createView(){return{target:t};}};targets.push(t);return t;};
const calls=[];
const moduleFor=id=>({roomInfo:{apiVersion:1,id,title:id,model:'Contract fixture, not physics',representativeScaleMeters:null,scaleMeaning:'Dimensionless test values',sources:[]},async createRoom({device,seed,assetBaseURL,quality}){
  assert.ok(assetBaseURL.startsWith('https://example.test/sub/assets/visualizer/'));
  assert.ok(['low','medium','high'].includes(quality));
  const b=device.createBuffer({size:256});let resized=false,steps=0;
  return{resize(s){resized=true;calls.push(['resize',id,s]);},step(s){assert.equal(s.dtSeconds,FIXED_DT);steps++;calls.push(['step',id]);},render({encoder,targetView}){assert.ok(resized);assert.equal(targetView.target.format,'rgba16float');assert.equal(encoder.submitted,false);calls.push(['render',id]);},snapshot(){return{apiVersion:1,id,model:'Contract fixture, not physics',numericalStepCount:steps,simulationTime:steps/60,simulationTimeUnits:'test units',parameters:{},quality,seedProvenance:{seed},diagnosticAgeSeconds:0};},async debugReadback(){return{steps};},dispose(){b.destroy();calls.push(['dispose',id]);}};
}});
const registry=new ModuleRegistry({baseURL:'https://example.test/sub/js/descent-host.js',importer:async url=>moduleFor(ROUTE.find(r=>url.includes(r.file)).id)});
await registry.probe();assert.equal(registry.entries.size,ROUTE.length);
const manager=new RoomManager({device,registry,targetFactory,width:80,height:60});
const observed={};
for(let route=0;route<2;route++)for(const r of ROUTE){
  await manager.select(r.id,'abcd'.repeat(16));manager.step(5);manager.render({submitted:false});observed[r.id]=manager.snapshot();
  assert.equal(manager.resources().liveRooms,1);assert.equal(alive,1);assert.equal(manager.resources().room.bytes,256);
}
assert.ok(routeCompleteness(registry,observed).complete);
const omitted={...observed};delete omitted[ROUTE.at(-1).id];assert.equal(routeCompleteness(registry,omitted).complete,false);
assert.equal(new RouteClock({index:99}).index,ROUTE.length-1);const end=new RouteClock();end.seek(99999);assert.equal(end.index,ROUTE.length-1);
manager.resize({width:120,height:50,dpr:1.5});assert.equal(targetDestroy,2*ROUTE.length);
manager.dispose();assert.equal(alive,0);assert.equal(deviceDestroyed,0);assert.equal(targetDestroy,2*ROUTE.length+1);
for(const retired of manager.resources().retired){assert.equal(retired.buffers,0);assert.equal(retired.created,retired.destroyed);}
const ledger=new ResourceLedger();const guarded=ledger.deviceFacade(device);assert.throws(()=>guarded.destroy(),/cannot destroy/);guarded.createTexture({size:[8,8],format:'rgba16float'});assert.equal(ledger.snapshot().bytes,512);ledger.dispose();assert.equal(alive,0);assert.throws(()=>guarded.createBuffer({size:4}),/after disposal/);
const failing=new ModuleRegistry({importer:async()=>{throw Error('missing module')}});await assert.rejects(()=>failing.load('soap-film'),/missing module/);assert.equal(failing.snapshot()[0].status,'unavailable');
assert.throws(()=>validateModule({},'soap-film'),/incompatible/);assert.throws(()=>validateSnapshot({apiVersion:1,id:'soap-film',model:'bad',value:NaN},'soap-film'),/nonfinite/);
assert.match(scaleLabel({representativeScaleMeters:1e-16,scaleMeaning:'Unsourced beta',sources:[]}),/Model units/);
assert.match(scaleLabel({representativeScaleMeters:1e-10,scaleMeaning:'Reference',sources:['https://example.test']},{scale:{meters:null,meaning:'Uncalibrated mode',source:null}}),/Model units/);
assert.equal(await deriveRoomSeed('abcd','soap-film',1),await deriveRoomSeed('abcd','soap-film',1));assert.notEqual(await deriveRoomSeed('abcd','soap-film',0),await deriveRoomSeed('abcd','soap-film',1));
const clock=new RouteClock();let changes=0;
for(let i=0;i<60*ROUTE.length*360;i++)if(clock.tick(FIXED_DT))changes++;
assert.equal(changes,2*ROUTE.length);assert.equal(clock.cycle,2);assert.ok(Math.abs(clock.total-ROUTE.length*360)<2e-8);
const event=new RouteClock({age:173.99});for(let i=0;i<60*50;i++)event.tick(FIXED_DT,{routeEvent:{pending:true}});assert.equal(event.index,1);
assert.equal(roomPresentation('soap-film',{parameters:{ruptureNm:18},diagnostics:{state:'intact',thicknessRangeNm:[19,100]}}).event.pending,true);
assert.equal(roomPresentation('soap-film',{parameters:{ruptureNm:18},diagnostics:{state:'intact',thicknessRangeNm:[21,100]}}).event.pending,false);
assert.equal(roomPresentation('soap-film',{parameters:{ruptureNm:18},diagnostics:{state:'rest',thicknessRangeNm:[0,0]}}).event.complete,true);
const ambient=new AmbientClock();let steps=0;ambient.frame(0,true,()=>steps++);ambient.frame(20,true,()=>steps++);assert.equal(steps,1);
ambient.frame(4000,false,()=>steps++);ambient.frame(5000,true,()=>steps++);assert.equal(steps,1);ambient.frame(5020,true,()=>steps++);assert.equal(steps,2);ambient.frame(20000,true,()=>steps++);assert.ok(steps<=5&&ambient.droppedSeconds>10);
// Playback advances an identical route through more fixed steps, and cannot
// carry fast-forward debt through a pause or exceed its bounded work count.
for(const rate of [1,4,12]) {
  const watch=new AmbientClock(),route=new RouteClock();let ticks=0;
  const step=()=>{ticks++;route.tick(FIXED_DT);};
  watch.frame(0,true,step,{rate});
  for(let i=1;i<=120;i++)watch.frame(i*1000/60,true,step,{rate});
  assert.ok(Math.abs(ticks-120*rate)<=1,`Rate ${rate} produced ${ticks} fixed steps`);
  assert.ok(Math.abs(route.total-ticks*FIXED_DT)<1e-9);
  watch.frame(10000,false,step,{rate});const before=ticks;
  watch.frame(11000,true,step,{rate});assert.equal(ticks,before);
  watch.frame(12000,true,step,{rate});assert.ok(ticks-before<=watch.maxSteps*rate);
}
for(const rate of [1,4,12]) {
  const watch=new AmbientClock(),route=new RouteClock();watch.frame(0,true,()=>{}, {rate});
  for(let i=1;i<=Math.ceil(60*ROUTE.length*180/rate)+1;i++)watch.frame(i*1000/60,true,()=>{route.tick(FIXED_DT);}, {rate});
  assert.equal(route.cycle,1,`Rate ${rate} completes one full route`);assert.equal(route.index,0);
}
const bounded=new AmbientClock();let expensive=0;
bounded.frame(0,true,()=>{}, {rate:12});
bounded.frame(100,true,()=>{expensive++;const started=performance.now();while(performance.now()-started<3){}},{rate:12,budgetMs:1});
assert.equal(expensive,1,'Expensive fixed steps yield before a second step');
// Simultaneous selections serialize creation and dispose their own resources.
const rapid=new RoomManager({device,registry,targetFactory});await Promise.all(ROUTE.map(r=>rapid.select(r.id,'abcd'.repeat(16))));assert.equal(rapid.active.id,ROUTE.at(-1).id);assert.equal(alive,1);rapid.dispose();assert.equal(alive,0);
console.log('PASS loading, per-module errors, contract, rgba16float, resize, pause and fast playback clocks, two routes, event ceiling, seed derivation, disposal and serialized selection');
