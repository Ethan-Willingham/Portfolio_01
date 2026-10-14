import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Hardware, playback and supply limits supplement the player-operation checks.
export async function checkStation({load,sample,evaluate,send,sleep,dump}){
 const results=[];
 const read=()=>evaluate('__toy.sluice()');
 async function advance(n){
  await evaluate("__toy.pause(false);__sluiceTest('stopLoop()')");
  for(let step=0;step<n;step+=20)await evaluate(`(async()=>{for(let i=0;i<${Math.min(20,n-step)};i++){__sluiceTest('frame(lastT?lastT+1000/60:1000/60);stopLoop();');}await __toy.liquid().queue.onSubmittedWorkDone();})()`);
 }
 async function rect(selector){return evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);}
 async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest'})`);const p=await rect(selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});}
 async function input(id,value){await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
 async function shot(name){await sleep(150);const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dump,name+'.png'),Buffer.from(s.data,'base64'));}
 async function settled(){for(let i=0;i<300;i++){if(await evaluate('!__toy.stats().loading&&__toy.machineState()?.ready'))return;await sleep(50);}assert.fail('new run did not finish');}
 function valid(s,label){assert(s.finite,label+': finite trajectories');assert.equal(s.penetrations,0,label+': collision polygons exclude water and grains');}
 async function pause(){await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');await sleep(100);}

 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,mobile:false,deviceScaleFactor:1});
 await load();await sleep(150);await pause();
 const beforeInspect=await sample();assert.equal(await evaluate('__toy.camera().zoom'),3.4,'the first riffles start large enough to inspect');
 await click('#sluice-next');assert.equal(await evaluate('document.getElementById("sluice-pocket").textContent'),'Pocket 2 of 10');
 const pan=await rect('.sluice-pan');await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pan});
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:pan.x+50,y:pan.y+12});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:pan.x+50,y:pan.y+12});
 assert.deepEqual(await sample(),beforeInspect,'paused inspection only moves the camera');
 await shot('station-inspect');await click('#sluice-fit');assert.equal(await evaluate('__toy.camera().zoom'),1);
 await click('#sluice-inspect');assert.equal(await evaluate('__toy.camera().zoom'),3.4,'the closer view can be restored');

 // The visible slow control and source share the native simulation clock.
 await click('#sluice-setup');await click('#sluice-slow');await click('#sluice-close');await input('sluice-flow','125');await evaluate("__sluiceTest('stopLoop()')");
 const slowStart=await read();await advance(80);const slowEnd=await read();
 assert(Math.abs(slowEnd.clock-slowStart.clock-80/60*1.55*.25)<.02,'quarter speed changes elapsed native time');
 const slowRate=(slowEnd.admitted-slowStart.admitted)/(slowEnd.sourceClock-slowStart.sourceClock);
 assert(Math.abs(slowRate-2250)<25,'slow motion preserves the native water rate');
 await pause();const stopped=await read();assert.equal(stopped.valve,false,'pause closes water');await sleep(150);assert.equal((await read()).clock,stopped.clock,'pause freezes native time');
 results.push({case:'camera-and-playback',slowRate});console.log('PASS station paused inspection and slow motion',JSON.stringify({slowRate}));

 // Rebuild through the visible settings. Drawing and collision use one scale.
 await click('#sluice-setup');await click('#sluice-slow');await input('sluice-slope','11');await input('sluice-riffle','12');
 await evaluate('document.getElementById("sluice-charge").checked=false');await shot('station-setup');await click('#sluice-run');await settled();await pause();
 const geometry=await evaluate('(()=>{const d=__toy.machineState().definition;return {slope:d.sluice.slope,height:d.sluice.riffleHeight,line:d.materialSlip.bed.line,first:d.sluice.polygons[0],bars:d.sluice.polygons.length};})()');
 assert.equal(geometry.slope,11);assert.equal(geometry.height,12);assert.equal(geometry.bars,11);
 assert(Math.abs(Math.hypot(geometry.line[2]-geometry.line[0],geometry.line[3]-geometry.line[1])/24-51)<1e-8,'actual sloped collision bed measures51 inches');
 assert.deepEqual(geometry.first[0],geometry.line.slice(0,2));assert.deepEqual(geometry.first[1],geometry.line.slice(2));
 const fresh=await sample();assert.equal(fresh.sand.n+fresh.blackSand.n+fresh.gold.n,0,'sample-off starts with no ore');assert.equal((await read()).hopper,2400);assert.equal((await read()).admitted,0);
 await input('sluice-flow','150');await input('sluice-feed-rate','240');
 for(let i=0;i<7;i++){await advance(80);valid(await sample(),'steep bed, tall riffles '+i);}
 await pause();const exhausted=await read(),full=await sample();
 assert.equal(exhausted.fed,2400);assert.equal(exhausted.hopper,0);assert.equal(exhausted.admitted,36000);assert.equal(exhausted.waterRemaining,0);assert.equal(exhausted.valve,false);
 assert.equal(full.sand.n,2202);assert.equal(full.blackSand.n,192);assert.equal(full.gold.n,6);assert.equal(full.n,fresh.n+36000+2400);
 await advance(30);assert.equal((await sample()).n,full.n,'empty supplies cannot silently refill');await pause();
 results.push({case:'geometry-and-finite-supplies',geometry,exhausted,n:full.n});console.log('PASS station geometry and finite supplies',JSON.stringify({particles:full.n,water:exhausted.admitted,fed:exhausted.fed}));await shot('station-exhausted');
 await click('#toy-restart');await settled();await pause();assert.equal((await read()).slope,11);assert.equal((await read()).riffleHeight,12);assert.equal((await read()).hopper,2400);assert.equal((await sample()).gold.n,0);
 await click('#sluice-setup');await input('sluice-length','36');await click('#sluice-run');await settled();await pause();
 const short=await evaluate('(()=>{const d=__toy.machineState().definition;return {length:d.sluice.lengthInches,line:d.materialSlip.bed.line,sections:d.sluice.sections.length};})()');
 assert.equal(short.length,36);assert.equal(short.sections,6);assert(Math.abs(Math.hypot(short.line[2]-short.line[0],short.line[3]-short.line[1])/24-36)<1e-8);
 await click('#toy-restart');await settled();await pause();assert.equal((await read()).lengthInches,36,'restart preserves the chosen length');await shot('station-short');
 await evaluate('document.getElementById("toy-input").focus()');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});assert.equal((await read()).valve,true,'W opens wash water');
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'g',code:'KeyG',windowsVirtualKeyCode:71});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'g',code:'KeyG',windowsVirtualKeyCode:71});await advance(70);
 assert.equal((await read()).fed,120,'G admits one finite scoop');assert.equal((await read()).feeding,false);await pause();
 fs.writeFileSync(path.join(dump,'station.json'),JSON.stringify(results,null,2));
 console.log('PASS station: physical51/36-inch geometry, collision safety, finite full mineral batch and water, camera-only inspection, native slow motion, pause, restart and keyboard');
}

async function captureAudioContexts(evaluate){
 await evaluate(`(()=>{const Native=window.AudioContext;window.__soundContexts=[];
  window.AudioContext=new Proxy(Native,{construct(Type,args){const context=Reflect.construct(Type,args);window.__soundContexts.push(context);return context;}});
 })()`);
}

export async function checkAudioLifecycle({load,evaluate,sleep,send}){
 await load();await sleep(250);await captureAudioContexts(evaluate);
 await evaluate('document.getElementById("sluice-setup").click();document.getElementById("sluice-sound").scrollIntoView({block:"center"})');
 const point=await evaluate('(()=>{const r=document.getElementById("sluice-sound").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await sleep(250);
 assert.equal(await evaluate('__soundContexts.at(-1).state'),'running');
 await evaluate('__sluiceTest("clearWorldAll();currentScene=\'blank\';setSceneChip(\'blank\');")');await sleep(300);
 assert.equal(await evaluate('__soundContexts.at(-1).state'),'closed');
 console.log('PASS real Web Audio context runs on request and closes on scene exit');
}
