import assert from 'node:assert/strict';
import { AmbientClock, RouteClock, ResourceLedger, ModuleRegistry, RoomManager, ROUTE, FIXED_DT, validateModule, validateSnapshot, scaleLabel, routeCompleteness, deriveRoomSeed } from '../js/descent-host.js';
import { roomPresentation } from '../js/descent-room-adapters.js';
let deviceDestroyed=0,alive=0,targetDestroy=0;
const fakeResource=()=>{alive++;return{destroy(){alive--;},createView(){return {nativeTestView:true};}};};
const device={createBuffer:fakeResource,createTexture:fakeResource,destroy(){deviceDestroyed++;},limits:{maxTextureDimension2D:8192}};
const targets=[];
const targetFactory=()=>{const t={format:'rgba16float',destroy(){targetDestroy++;},createView(){return{target:t};}};targets.push(t);return t;};
const calls=[];
const moduleFor=id=>({roomInfo:{apiVersion:1,id,title:id,model:id==='qcd-lava-lamp'?'SU(3) pure gauge contract fixture':'Contract fixture, not physics',representativeScaleMeters:null,scaleMeaning:'Dimensionless test values',sources:[]},async createRoom({device,seed,assetBaseURL,quality}){
  assert.ok(assetBaseURL.startsWith('https://example.test/sub/assets/visualizer/'));
  assert.ok(['low','medium','high'].includes(quality));
  const b=device.createBuffer({size:256});let resized=false,steps=0;
  return{resize(s){resized=true;calls.push(['resize',id,s]);},step(s){assert.equal(s.dtSeconds,FIXED_DT);steps++;calls.push(['step',id]);},render({encoder,targetView}){assert.ok(resized);assert.equal(targetView.target.format,'rgba16float');assert.equal(encoder.submitted,false);calls.push(['render',id]);},snapshot(){return{apiVersion:1,id,model:id==='qcd-lava-lamp'?'SU(3) pure gauge contract fixture':'Contract fixture, not physics',numericalStepCount:steps,simulationTime:steps/60,simulationTimeUnits:'test units',parameters:{},quality,seedProvenance:{seed},diagnosticAgeSeconds:0};},async debugReadback(){return{steps};},dispose(){b.destroy();calls.push(['dispose',id]);}};
}});
const registry=new ModuleRegistry({baseURL:'https://example.test/sub/js/descent-host.js',importer:async url=>moduleFor(ROUTE.find(r=>url.includes(r.file)).id)});
await registry.probe();assert.equal(registry.entries.size,4);
const manager=new RoomManager({device,registry,targetFactory,width:80,height:60});
const observed={};
for(let route=0;route<2;route++)for(const r of ROUTE){
  await manager.select(r.id,'abcd'.repeat(16));manager.step(5);manager.render({submitted:false});observed[r.id]=manager.snapshot();
  assert.equal(manager.resources().liveRooms,1);assert.equal(alive,1);assert.equal(manager.resources().room.bytes,256);
}
assert.ok(routeCompleteness(registry,observed).complete);
observed['qcd-lava-lamp'].model='SU(2) pure gauge fixture';assert.equal(routeCompleteness(registry,observed).complete,false);
manager.resize({width:120,height:50,dpr:1.5});assert.equal(targetDestroy,8);
manager.dispose();assert.equal(alive,0);assert.equal(deviceDestroyed,0);assert.equal(targetDestroy,9);
for(const retired of manager.resources().retired){assert.equal(retired.buffers,0);assert.equal(retired.created,retired.destroyed);}
const ledger=new ResourceLedger();const guarded=ledger.deviceFacade(device);assert.throws(()=>guarded.destroy(),/cannot destroy/);guarded.createTexture({size:[8,8],format:'rgba16float'});assert.equal(ledger.snapshot().bytes,512);ledger.dispose();assert.equal(alive,0);assert.throws(()=>guarded.createBuffer({size:4}),/after disposal/);
const failing=new ModuleRegistry({importer:async()=>{throw Error('missing module')}});await assert.rejects(()=>failing.load('soap-film'),/missing module/);assert.equal(failing.snapshot()[0].status,'unavailable');
assert.throws(()=>validateModule({},'soap-film'),/incompatible/);assert.throws(()=>validateSnapshot({apiVersion:1,id:'soap-film',model:'bad',value:NaN},'soap-film'),/nonfinite/);
assert.match(scaleLabel({representativeScaleMeters:1e-16,scaleMeaning:'Unsourced beta',sources:[]}),/Model units/);
assert.match(scaleLabel({representativeScaleMeters:1e-10,scaleMeaning:'Reference',sources:['https://example.test']},{scale:{meters:null,meaning:'Uncalibrated mode',source:null}}),/Model units/);
assert.equal(await deriveRoomSeed('abcd','soap-film',1),await deriveRoomSeed('abcd','soap-film',1));assert.notEqual(await deriveRoomSeed('abcd','soap-film',0),await deriveRoomSeed('abcd','soap-film',1));
const clock=new RouteClock();let changes=0;
for(let i=0;i<60*1440;i++)if(clock.tick(FIXED_DT))changes++;
assert.equal(changes,8);assert.equal(clock.cycle,2);assert.ok(Math.abs(clock.total-1440)<2e-8);
const event=new RouteClock({age:173.99});for(let i=0;i<60*50;i++)event.tick(FIXED_DT,{routeEvent:{pending:true}});assert.equal(event.index,1);
assert.equal(roomPresentation('soap-film',{parameters:{ruptureNm:18},diagnostics:{state:'intact',thicknessRangeNm:[19,100]}}).event.pending,true);
assert.equal(roomPresentation('soap-film',{parameters:{ruptureNm:18},diagnostics:{state:'intact',thicknessRangeNm:[21,100]}}).event.pending,false);
assert.equal(roomPresentation('soap-film',{parameters:{ruptureNm:18},diagnostics:{state:'rest',thicknessRangeNm:[0,0]}}).event.complete,true);
const ambient=new AmbientClock();let steps=0;ambient.frame(0,true,()=>steps++);ambient.frame(20,true,()=>steps++);assert.equal(steps,1);
ambient.frame(4000,false,()=>steps++);ambient.frame(5000,true,()=>steps++);assert.equal(steps,1);ambient.frame(5020,true,()=>steps++);assert.equal(steps,2);ambient.frame(20000,true,()=>steps++);assert.ok(steps<=5&&ambient.droppedSeconds>10);
// Simultaneous selections serialize creation and dispose their own resources.
const rapid=new RoomManager({device,registry,targetFactory});await Promise.all(ROUTE.map(r=>rapid.select(r.id,'abcd'.repeat(16))));assert.equal(rapid.active.id,ROUTE.at(-1).id);assert.equal(alive,1);rapid.dispose();assert.equal(alive,0);
console.log('PASS loading, per-module errors, contract, rgba16float, resize, pause clock, two routes, event ceiling, seed derivation, disposal and serialized selection');
