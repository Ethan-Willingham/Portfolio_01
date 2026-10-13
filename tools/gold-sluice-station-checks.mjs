import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Exercise real DOM controls and native GPU state. No replacement solver or scores.
export async function checkStation({load,sample,evaluate,send,sleep,dump,audioEvents}){
 const results=[];
 const read=()=>evaluate('__toy.sluice()');
 async function advance(n){
  await evaluate("__toy.pause(false);__sluiceTest('stopLoop()')");
  for(let step=0;step<n;step+=20)await evaluate(`(async()=>{for(let i=0;i<${Math.min(20,n-step)};i++){__sluiceTest('frame(lastT?lastT+1000/60:1000/60);stopLoop();');}await __toy.liquid().queue.onSubmittedWorkDone();})()`);
 }
 async function rect(selector){return evaluate(`(()=>{let b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,width:b.width,height:b.height,left:b.left,top:b.top,right:b.right,bottom:b.bottom};})()`);}
 async function click(selector){let p=await rect(selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:p.x,y:p.y});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:p.x,y:p.y});}
 async function input(id,value){await evaluate(`(()=>{let e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
 async function shot(name){await sleep(220);let s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dump,name+'.png'),Buffer.from(s.data,'base64'));}
 async function settled(){for(let i=0;i<300;i++){if(await evaluate('!__toy.stats().loading&&__toy.machineState()?.ready'))return;await sleep(50);}assert.fail('new run did not finish');}
 function valid(s,label){assert(s.finite,label+': finite trajectories');assert.equal(s.penetrations,0,label+': collision polygons exclude water and grains');}
 async function pause(){await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');await sleep(250);}

 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,mobile:false,deviceScaleFactor:1});
 await load();await sleep(250);const initial=await sample();
 await send('WebAudio.enable');
 assert.equal(await evaluate('document.getElementById("sluice-sound").getAttribute("aria-pressed")'),'false','sound starts off');
 await click('#sluice-sound');await sleep(250);assert.equal(await evaluate('document.getElementById("sluice-sound").getAttribute("aria-pressed")'),'true');
 const audioContext=audioEvents.find(e=>e.method==='WebAudio.contextCreated')?.params.context;
 assert(audioContext,'sound uses a real Web Audio context');
 const audioReading=await send('WebAudio.getRealtimeData',{contextId:audioContext.contextId});
 assert(audioReading.realtimeData.currentTime>0,'audio runs after the user gesture');
 assert.equal(await evaluate('document.querySelector(".sluice-console").hidden'),false);
 await shot('station-desktop');
 // Equal native time at different volume flows, measured from the admitted population.
 await click('#sluice-water');await evaluate("__sluiceTest('stopLoop()')");await input('sluice-flow','25');
 const lowStart=await read();await advance(40);const lowEnd=await read();
 await input('sluice-flow','125');const highStart=await read();await advance(40);const highEnd=await read();
 const lowRate=(lowEnd.admitted-lowStart.admitted)/(lowEnd.sourceClock-lowStart.sourceClock),highRate=(highEnd.admitted-highStart.admitted)/(highEnd.sourceClock-highStart.sourceClock);
 assert(Math.abs(lowRate-450)<12,'25% really meters the declared water rate');assert(Math.abs(highRate-2250)<20,'125% meters five times the water in native time');
 await click('#sluice-water');const stopped=await read();await advance(20);assert.equal((await read()).admitted,stopped.admitted,'closed valve has no admission backlog');
 results.push({case:'flow',lowRate,highRate});
 console.log('PASS station metered flow',JSON.stringify({lowRate,highRate}));

 // A pointer hold releases the sparse shuffled batch, with original ids intact.
 let feed=await rect('#sluice-feed');await click('#sluice-water');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:feed.x,y:feed.y});
 await advance(100);await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:20,y:100});
 let fed=await read();assert(fed.fed>240&&fed.fed<360,'feed is metered at 120 grains per native second');assert.equal(fed.valve,true,'releasing feed preserves the separate water valve');
 await advance(20);assert.equal((await read()).fed,fed.fed,'release outside the target stops feeding immediately');
 await pause();let grains=await sample();valid(grains,'mixed feed');
 assert.equal(grains.n,initial.n+(await read()).admitted+fed.fed,'every particle is initial water/ore or a counted transfer');
 const prefix=await evaluate('__toy.machineState().definition.sluice.feedMaterials.slice(0,'+fed.fed+')');
 assert.equal(grains.gold.n-initial.gold.n,prefix.filter(x=>x==='gold').length,'only declared sparse gold entered');
 assert.equal(grains.blackSand.n-initial.blackSand.n,prefix.filter(x=>x==='black-sand').length,'only declared magnetite entered');
 assert.equal(grains.sand.n-initial.sand.n,prefix.filter(x=>x==='sand').length,'remaining feed is quartz');
 assert.deepEqual(grains.ids.filter(([id])=>id<initial.n),initial.ids,'existing material identities survive appended feed');
 results.push({case:'feed',fed:fed.fed,gold:grains.gold.n,sand:grains.sand.n});
 console.log('PASS station finite feed',JSON.stringify(results.at(-1)));
 await shot('station-fed');

 // Inspection never applies a stir or attraction. Drag pans only the camera.
 let beforeInspect=await sample();await click('#sluice-inspect');assert.equal(await evaluate('__toy.camera().zoom'),2.8);
 await click('#sluice-next');assert.equal(await evaluate('document.getElementById("sluice-pocket").textContent'),'Pocket 2 of 10');
 let pan=await rect('.sluice-pan');await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:pan.x,y:pan.y});
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:pan.x+50,y:pan.y+12});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:pan.x+50,y:pan.y+12});
 assert.deepEqual(await sample(),beforeInspect,'paused inspection leaves every sampled position, velocity and id unchanged');
 await shot('station-inspect');await click('#sluice-fit');assert.equal(await evaluate('__toy.camera().zoom'),1);

 // Slow motion scales the clock and the input rate together.
 await click('#sluice-slow');await click('#sluice-water');await evaluate("__sluiceTest('stopLoop()')");let slowStart=await read();await advance(80);let slowEnd=await read();
 assert(Math.abs(slowEnd.clock-slowStart.clock-80/60*1.55*.25)<.02,'quarter speed changes elapsed native time');
 const slowRate=(slowEnd.admitted-slowStart.admitted)/(slowEnd.sourceClock-slowStart.sourceClock);
 assert(Math.abs(slowRate-2250)<25,'slow motion does not multiply water supply: '+JSON.stringify({slowRate,slowStart,slowEnd}));
 console.log('PASS station paused inspection and slow motion',JSON.stringify({slowRate}));
 await pause();assert.equal((await read()).valve,false,'pause shuts the valve');await click('#sluice-slow');

 // Rebuild through the visible settings. Shader geometry and drawing share coordinates.
 await click('#sluice-setup');await input('sluice-slope','11');await input('sluice-riffle','12');
 await evaluate('document.getElementById("sluice-charge").checked=false');await shot('station-setup');
 await click('#sluice-run');await settled();await pause();
 const geometry=await evaluate('(()=>{let d=__toy.machineState().definition;return {slope:d.sluice.slope,height:d.sluice.riffleHeight,line:d.materialSlip.bed.line,first:d.sluice.polygons[0],bars:d.sluice.polygons.length,clock:__toy.sluice().clock};})()');
 assert.equal(geometry.slope,11);assert.equal(geometry.height,12);assert.equal(geometry.bars,11);
 assert(Math.abs(Math.hypot(geometry.line[2]-geometry.line[0],geometry.line[3]-geometry.line[1])/24-51)<1e-8,'51 inches along the actual sloped collision bed');
 assert.deepEqual(geometry.first[0],geometry.line.slice(0,2));assert.deepEqual(geometry.first[1],geometry.line.slice(2));
 let fresh=await sample();assert.equal(fresh.sand.n+fresh.blackSand.n+fresh.gold.n,0,'sample-off starts with an empty bed');assert.equal((await read()).hopper,2400);assert.equal((await read()).admitted,0);
 // Both finite supplies exhaust through the same native append operations.
 await input('sluice-flow','150');await click('#sluice-water');feed=await rect('#sluice-feed');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:feed.x,y:feed.y});
 for(let i=0;i<8;i++){await advance(105);valid(await sample(),'steep bed, high riffles '+i);console.log('Station supply checkpoint',JSON.stringify(await read()));}
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:feed.x,y:feed.y});await pause();
 let exhausted=await read(),full=await sample();
 assert.equal(exhausted.fed,2400);assert.equal(exhausted.hopper,0);assert.equal(exhausted.admitted,36000);assert.equal(exhausted.waterRemaining,0);assert.equal(exhausted.valve,false);
 assert.equal(full.sand.n,2202);assert.equal(full.blackSand.n,192);assert.equal(full.gold.n,6);assert.equal(full.n,fresh.n+36000+2400);
 await advance(30);let unchanged=await sample();assert.equal(unchanged.n,full.n,'empty supplies cannot produce more particles');await pause();
 results.push({case:'finite-supplies',geometry,exhausted,n:full.n});await shot('station-exhausted');
 // Top-level restart preserves the chosen real bed and restores supplies.
 await click('#toy-restart');await settled();await pause();assert.equal((await read()).slope,11);assert.equal((await read()).riffleHeight,12);assert.equal((await read()).hopper,2400);assert.equal((await sample()).gold.n,0);
 // The short option changes physical length, pocket count and camera framing.
 await click('#sluice-setup');await input('sluice-length','36');await click('#sluice-run');await settled();await pause();
 let short=await evaluate('(()=>{const d=__toy.machineState().definition;return {length:d.sluice.lengthInches,line:d.materialSlip.bed.line,sections:d.sluice.sections.length};})()');
 assert.equal(short.length,36);assert.equal(short.sections,6);assert(Math.abs(Math.hypot(short.line[2]-short.line[0],short.line[3]-short.line[1])/24-36)<1e-8);
 await click('#toy-restart');await settled();await pause();assert.equal((await read()).lengthInches,36,'restart preserves hardware length');
 await shot('station-short');

 // Real landscape touch, including release/cancel, keyboard and focus loss.
 for(const width of [844,667]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:390,mobile:true,deviceScaleFactor:2});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await load();await sleep(250);
  for(const id of ['water','feed','slow','inspect','setup','flow','sound']){let b=await rect('#sluice-'+id);assert(b.width>=44&&b.height>=44,id+': minimum touch target');assert(b.left>=0&&b.right<=width&&b.top>=0&&b.bottom<=390,id+': within viewport');}
  if(width>=800){const a=await rect('.sluice-feed-controls'),b=await rect('.sluice-view-controls');assert(a.right<=b.left,'feed and view groups do not overlap');}
  feed=await rect('#sluice-feed');await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:feed.x,y:feed.y,id:1,radiusX:4,radiusY:4}]});
  await advance(40);await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});let cancelled=await read();assert(cancelled.fed>0);assert.equal(cancelled.feeding,false);
  await advance(20);assert.equal((await read()).fed,cancelled.fed,'touchcancel drops held feed');await pause();await shot('station-landscape-'+width);
 }
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 await evaluate('document.getElementById("toy-input").focus()');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});assert.equal((await read()).valve,true,'W toggles wash water');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'g',code:'KeyG',windowsVirtualKeyCode:71});assert.equal((await read()).feeding,true,'G holds feed');
 await evaluate('window.dispatchEvent(new Event("blur"))');assert.equal((await read()).feeding,false);assert.equal((await read()).valve,false,'focus loss shuts supplies');
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'g',code:'KeyG',windowsVirtualKeyCode:71});
 await click('#sluice-slow');await click('#sluice-inspect');
 await captureAudioContexts(evaluate);await click('#sluice-sound');await sleep(250);
 await evaluate('__sluiceTest("clearWorldAll();currentScene=\'blank\';setSceneChip(\'blank\');")');await sleep(300);
 assert.equal(await evaluate('document.querySelector(".sluice-console").hidden'),true,'controls leave with the scene');assert.equal(await evaluate('__toy.camera().zoom'),1);assert.equal(await evaluate('__toy.stats().timeScale'),1,'scene exit restores playback speed');
 fs.writeFileSync(path.join(dump,'audio.json'),JSON.stringify(audioEvents.filter(e=>e.method.startsWith('WebAudio.context')),null,2));
 // Chrome does not consistently emit a protocol event for close(). Inspect the
 // retained real context, without replacing its audio graph or its methods.
 assert.equal(await evaluate('window.__soundContexts.at(-1).state'),'closed','scene exit closes its audio context');
 await evaluate('__toy.scene("blank")');await sleep(700);assert.equal(await evaluate('__toy.liquid().materialSlip'),undefined);
 fs.writeFileSync(path.join(dump,'station.json'),JSON.stringify(results,null,2));
 console.log('PASS station: native flow, finite hopper and water, identity, physical setup, camera-only inspection, pause, slow motion, keyboard, landscape touch, cleanup');
}

async function captureAudioContexts(evaluate){
 await evaluate(`(()=>{const Native=window.AudioContext;window.__soundContexts=[];
  window.AudioContext=new Proxy(Native,{construct(Type,args){const context=Reflect.construct(Type,args);window.__soundContexts.push(context);return context;}});
 })()`);
}

export async function checkAudioLifecycle({load,evaluate,sleep,send}){
 await load();await sleep(250);await captureAudioContexts(evaluate);
 const point=await evaluate('(()=>{const r=document.getElementById("sluice-sound").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await sleep(250);
 assert.equal(await evaluate('__soundContexts.at(-1).state'),'running');
 await evaluate('__sluiceTest("clearWorldAll();currentScene=\'blank\';setSceneChip(\'blank\');")');await sleep(300);
 assert.equal(await evaluate('__soundContexts.at(-1).state'),'closed');
 console.log('PASS real Web Audio context runs on request and closes on scene exit');
}
