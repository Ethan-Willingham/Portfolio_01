import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Exercise the player's controls against native GPU inventory and trajectories.
// The short outlet fixture only places the initial test specimens. Collection
// must then happen through the actual solver and physical cleanout chute.
export async function checkOperations({load,sample,evaluate,send,sleep,dump}){
 const results=[];
 const read=()=>evaluate('(async()=>{await __toy.liquid().queue.onSubmittedWorkDone();__toy.liquid().syncReadback();return __toy.sluice();})()');
 async function advance(n){
  await evaluate("__toy.pause(false);__sluiceTest('stopLoop()')");
  for(let step=0;step<n;step+=20)await evaluate(`(async()=>{for(let i=0;i<${Math.min(20,n-step)};i++){__sluiceTest('frame(lastT?lastT+1000/60:1000/60);stopLoop();');}await __toy.liquid().queue.onSubmittedWorkDone();__toy.liquid().syncReadback();})()`);
 }
 async function pause(){await evaluate('__toy.pause(true);__toy.liquid().queue.onSubmittedWorkDone()');await sleep(100);await read();}
 async function rect(selector){return evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,width:b.width,height:b.height,left:b.left,top:b.top,right:b.right,bottom:b.bottom};})()`);}
 async function click(selector){const p=await rect(selector);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:p.x,y:p.y});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:p.x,y:p.y});}
 async function input(id,value){await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
 async function shot(name){await sleep(150);const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dump,name+'.png'),Buffer.from(s.data,'base64'));}
 async function rawGrains(){return evaluate(`(async()=>{
  const e=__toy.liquid(),n=e.uploadedCount,b=e.device.createBuffer({size:n*20,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{const command=e.device.createCommandEncoder();command.copyBufferToBuffer(e.buf.pos,0,b,0,n*16);command.copyBufferToBuffer(e.buf.flag,0,b,n*16,n*4);e.queue.submit([command.finish()]);await b.mapAsync(GPUMapMode.READ);
   const data=b.getMappedRange(),p=new Float32Array(data,0,n*4),f=new Uint32Array(data,n*16,n),grains=[];
   for(let i=0;i<n;i++)if(((f[i]&3)|((f[i]>>4)&4))===5)grains.push({id:i,flag:f[i]&79,x:p[i*4],y:p[i*4+1],vx:p[i*4+2],vy:p[i*4+3]});return {n,grains};
  }finally{b.destroy();}
 })()`);}
 function identity(s){return s.grains.map(p=>[p.id,p.flag]);}
 function valid(s,label){assert(s.finite,label+': finite trajectories');assert.equal(s.penetrations,0,label+': no grain or water crosses a collision polygon');}
 function accounting(s,label){for(const key of ['sand','blackSand','gold']){const q=s[key];assert.equal(q.bed+q.moving+q.washed+q.collected+q.spilled,q.total,label+': '+key+' occupies one observed location');}}

 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,mobile:false,deviceScaleFactor:1});
 await load({initialCharge:false});await sleep(150);
 const initial=await sample();
 // The water slider itself is a valve. No second hidden toggle is required.
 await input('sluice-flow','0');const off=await read();await advance(30);
 assert.equal((await read()).admitted,off.admitted,'zero water slider admits no parcels');assert.equal((await read()).valve,false);
 await input('sluice-flow','25');const lowStart=await read();await advance(40);const lowEnd=await read();
 await input('sluice-flow','150');const highStart=await read();await advance(40);const highEnd=await read();
 const lowRate=(lowEnd.admitted-lowStart.admitted)/(lowEnd.sourceClock-lowStart.sourceClock),highRate=(highEnd.admitted-highStart.admitted)/(highEnd.sourceClock-highStart.sourceClock);
 assert(Math.abs(lowRate-450)<15,'trickle admits 450 native parcels/sec');assert(Math.abs(highRate-2700)<25,'strong admits 2700 native parcels/sec');
 await input('sluice-flow','0');const closed=await read();await advance(30);assert.equal((await read()).admitted,closed.admitted,'zero closes immediately without a backlog');
 results.push({case:'water-slider',lowRate,highRate});console.log('PASS operation water slider',JSON.stringify(results.at(-1)));

 // A metered feeder and a finite scoop both release the same shuffled hopper.
 await input('sluice-feed-rate','40');const slowStart=await read();await advance(60);const slowEnd=await read();
 await input('sluice-feed-rate','200');const fastStart=await read();await advance(60);const fastEnd=await read();
 const slowRate=(slowEnd.fed-slowStart.fed)/(slowEnd.clock-slowStart.clock),fastRate=(fastEnd.fed-fastStart.fed)/(fastEnd.clock-fastStart.clock);
 assert(Math.abs(slowRate-40)<2,'slow feeder counts actual admitted grains');assert(Math.abs(fastRate-200)<3,'fast feeder meters actual grains per native second');
 await input('sluice-feed-rate','0');const feedOff=await read();await advance(30);assert.equal((await read()).fed,feedOff.fed,'zero feeder stops with no stored release');
 await click('#sluice-scoop');const scoopStart=await read();await advance(70);const scooped=await read();
 assert.equal(scooped.fed-feedOff.fed,120,'one scoop contains exactly 120 actual grains');assert.equal(scooped.scoopRemaining,0);assert.equal(scooped.feeding,false,'finite scoop shuts its feeder');
 await advance(30);assert.equal((await read()).fed,scooped.fed,'completed scoop cannot continue feeding');
 await pause();const mixed=await sample(),fed=await read();valid(mixed,'metered mixed paydirt');accounting(fed,'metered mixed paydirt');
 const prefix=await evaluate('__toy.machineState().definition.sluice.feedMaterials.slice(0,'+fed.fed+')');
 assert.equal(mixed.n,initial.n+fed.admitted+fed.fed,'particle total equals initial water plus counted water and hopper transfers');
 for(const [key,material] of [['sand','sand'],['blackSand','black-sand'],['gold','gold']])assert.equal(mixed[key].n,prefix.filter(x=>x===material).length,'feeder preserves actual '+key+' composition');
 results.push({case:'feeder-and-scoop',slowRate,fastRate,fed:fed.fed,scoopScheduled:scoopStart.scoopRemaining,inventory:fed});console.log('PASS operation feeder and scoop',JSON.stringify({slowRate,fastRate,fed:fed.fed}));await shot('operation-wash');

 // Closing the app or pausing the simulation makes both external sources safe.
 await input('sluice-flow','100');await input('sluice-feed-rate','120');await pause();let stopped=await read();
 assert.equal(stopped.valve,false,'pause closes water');assert.equal(stopped.feeding,false,'pause closes feed');
 await advance(20);assert.equal((await read()).admitted,stopped.admitted);assert.equal((await read()).fed,stopped.fed);
 await input('sluice-flow','100');await click('#sluice-scoop');await evaluate('window.dispatchEvent(new Event("blur"))');stopped=await read();
 assert.equal(stopped.valve,false,'focus loss closes water');assert.equal(stopped.feeding,false,'focus loss stops a scoop');
 await advance(20);assert.equal((await read()).admitted,stopped.admitted);assert.equal((await read()).fed,stopped.fed);await pause();

 // Seed a short outlet specimen through the host's real append path. These are
 // initial conditions, not a fake recovery result or a replacement solver.
 await load({initialCharge:false});
 const fixture=await evaluate(`__sluiceTest("(()=>{const d=machineState.definition.sluice,ids=[];for(let i=0;i<3;i++){const x=d.tailingsX-14-i*3;ids.push(addLiquidParticle(['sand','black-sand','gold'][i],x,d.floor(x)-2,35,0,0));}for(let i=0;i<3;i++)ids.push(addLiquidParticle(['sand','black-sand','gold'][i],d.tailings.x+d.tailings.width*.5+i*3,d.tailings.y+d.tailings.height-20,0,0,0));return ids;})()")`);
 await advance(1);await pause();const before=await rawGrains();assert.equal(before.grains.length,6);
 await click('#sluice-cleanup');await pause();const switched=await rawGrains(),cleanup=await read();
 assert.equal(cleanup.cleanup,true,'cleanout selects the physical concentrate receiver');assert.equal(cleanup.valve,false,'cleanout starts with water shut');assert.equal(cleanup.feeding,false,'cleanout shuts the hopper');
 assert.deepEqual(switched,before,'lifting riffles and fitting a chute never teleports, removes or accelerates any particle');
 assert.equal(await evaluate('__toy.liquid().materialSlip.stats().cleanup'),true,'cleanout enables the native chute contacts');
 await input('sluice-feed-rate','240');await click('#sluice-scoop');const blocked=await read();assert.equal(blocked.feeding,false,'cleanout cannot add fresh paydirt');assert.equal(blocked.fed,0);
 await input('sluice-flow','150');
 for(let step=0;step<1200;step+=80){await advance(80);const current=await rawGrains(),pan=await evaluate('__toy.machineState().definition.sluice.collection');if(fixture.slice(0,3).every(id=>{const p=current.grains.find(p=>p.id===id);return p.x>=pan.x&&p.x<=pan.x+pan.width&&p.y>=pan.y&&p.y<=pan.y+pan.height;}))break;}
 await pause();const rinsed=await rawGrains(),collected=await read();
 assert.deepEqual(identity(rinsed),identity(before),'all grain ids and material identities survive actual collection');assert.equal(rinsed.n,before.n+collected.admitted,'cleanout only adds the explicitly admitted rinse water');
 accounting(collected,'cleanout collection');valid(await sample(),'cleanout collection');
 const geometry=await evaluate('(()=>{const d=__toy.machineState().definition.sluice;return {collection:d.collection,tailings:d.tailings};})()');
 const inside=(p,r)=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;
 for(const id of fixture.slice(0,3)){const p=rinsed.grains.find(p=>p.id===id);assert(inside(p,geometry.collection),'outlet specimen '+id+' physically enters the collection pan: '+JSON.stringify({p,geometry}));}
 for(const id of fixture.slice(3)){const p=rinsed.grains.find(p=>p.id===id);assert(inside(p,geometry.tailings),'previous tailings '+id+' remain in their separate receiver');}
 // The on-screen CPU mirror may trail the exact GPU snapshot at the moment
 // the last grain enters the pan. The transfer assertions below use the
 // stopped native state, then confirm the refreshed ledgers.
 for(const key of ['sand','blackSand','gold'])assert.equal(collected[key].total,2,key+' still exists before pickup');
 results.push({case:'physical-cleanout',fixture,before,after:rinsed,inventory:collected,geometry});console.log('PASS operation physical cleanout',JSON.stringify(collected));await shot('operation-cleanout');

 // Picking up the wet pan transfers every actual resident inside it. The
 // remaining GPU positions, flags and APIC affine tensors stay byte-identical.
 async function nativeDigest(rect){return evaluate(`(async()=>{
  const e=__toy.liquid(),n=e.uploadedCount,b=e.device.createBuffer({size:n*36,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{const cmd=e.device.createCommandEncoder();cmd.copyBufferToBuffer(e.buf.pos,0,b,0,n*16);cmd.copyBufferToBuffer(e.buf.affine,0,b,n*16,n*16);cmd.copyBufferToBuffer(e.buf.flag,0,b,n*32,n*4);e.queue.submit([cmd.finish()]);await b.mapAsync(GPUMapMode.READ);
   const bytes=b.getMappedRange(),p=new Float32Array(bytes,0,n*4),u=new Uint32Array(bytes),flags=new Uint32Array(bytes,n*32,n),rows=[];let selected=0;
   const area=${JSON.stringify(rect)};
   for(let i=0;i<n;i++){
    const inside=area&&p[i*4]>=area.x&&p[i*4]<=area.x+area.width&&p[i*4+1]>=area.y&&p[i*4+1]<=area.y+area.height;
    if(inside){selected++;continue;}
    rows.push(Array.from(u.subarray(i*4,i*4+4)).join(',')+'|'+Array.from(u.subarray(n*4+i*4,n*4+i*4+4)).join(',')+'|'+flags[i]);
   }
   rows.sort();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rows.join(';')));
   return {n,selected,hash:Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('')};
  }finally{b.destroy();}
 })()`);}
 const panBefore=await nativeDigest(geometry.collection);
 assert(panBefore.selected>1024,'wet-pan transfer crosses the old small-op threshold');
 const panResult=await evaluate('__toy.sluiceTransfer("collect")');
 const panAfter=await nativeDigest(null),saved=await read();
 assert.equal(panResult.materials.water+panResult.materials.sand+panResult.materials.blackSand+panResult.materials.gold,panBefore.selected);
 assert.equal(panAfter.n,panBefore.n-panBefore.selected);
 assert.equal(panAfter.hash,panBefore.hash,'pan pickup preserves every survivor GPU position, affine tensor and flag');
 assert.equal(saved.secured.gold,1);assert.equal(saved.secured.blackSand,1);assert.equal(saved.secured.sand,1);
 assert.equal(saved.storedWater,panResult.materials.water);
 assert.equal(saved.gold.total,collected.gold.total,'saved gold remains in total inventory');
 const tailBefore=await nativeDigest(geometry.tailings);
 const tailResult=await evaluate('__toy.sluiceTransfer("tailings")');
 const tailAfter=await nativeDigest(null),emptied=await read();
 assert.equal(tailAfter.n,tailBefore.n-tailBefore.selected);
 assert.equal(tailAfter.hash,tailBefore.hash,'tailings removal preserves every survivor GPU position, affine tensor and flag');
 assert.equal(emptied.discarded.gold,1);assert.equal(emptied.discarded.blackSand,1);assert.equal(emptied.discarded.sand,1);
 assert.equal(emptied.discardedWater,tailResult.materials.water);
 assert.equal(emptied.gold.total,saved.gold.total,'emptying tailings conserves declared gold inventory');
 assert.equal((await sample()).water+emptied.storedWater+emptied.discardedWater,before.n-before.grains.length+emptied.admitted,'all initial and admitted water remains resident or in an explicit receiver ledger');
 const second=await evaluate('__toy.sluiceTransfer("collect")');assert.equal(second.materials.gold,0,'empty pan cannot duplicate recovered gold');
 assert.equal((await read()).secured.gold,1);
 const refillBefore=await read();assert.equal(await evaluate('__toy.sluiceControl("refill",true)'),true);
 const refillAfter=await read();assert.equal(refillAfter.waterRemaining-refillBefore.waterRemaining,18000,'refill adds a declared finite water reserve');
 assert.equal(refillAfter.admitted,refillBefore.admitted,'refill alone does not create live water');
 console.log('PASS operation pickup, emptying and refill',JSON.stringify({pan:panResult.materials,tailings:tailResult.materials,refill:refillAfter.waterRemaining}));

 // The same operating controls remain reachable on landscape touch screens.
 for(const width of [844,667]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:390,mobile:true,deviceScaleFactor:2});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await load({initialCharge:false});await sleep(150);
  for(const id of ['flow','feed-rate','scoop','cleanup']){const b=await rect('#sluice-'+id);assert(b.width>=44&&b.height>=44,id+': minimum touch target at '+width);assert(b.left>=0&&b.right<=width&&b.top>=0&&b.bottom<=390,id+': fully reachable at '+width+': '+JSON.stringify(b));}
  const scoop=await rect('#sluice-scoop');await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:scoop.x,y:scoop.y,id:1,radiusX:4,radiusY:4}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await advance(70);
  const touch=await read();assert.equal(touch.fed,120,'one landscape tap releases one finite scoop');assert.equal(touch.feeding,false,'landscape scoop stops by itself');await pause();await shot('operation-landscape-'+width);
 }
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});
 fs.writeFileSync(path.join(dump,'operations.json'),JSON.stringify(results,null,2));
 console.log('PASS operations: actual water and feed rates, finite scoop composition, safe source stop, physical mixed concentrate collection, separate tailings and landscape controls');
}
