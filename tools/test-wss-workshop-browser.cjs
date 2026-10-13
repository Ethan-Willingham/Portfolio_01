const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),{chromium,launchOptions}=require('./under-street/browser-support.cjs');
const dump=process.env.DUMP||'/tmp/wss-workshop-review';fs.mkdirSync(dump,{recursive:true});
const ids=(process.env.SCENES||'vacuum-coffee,steam-geyser,hero-temple-doors,water-half-adder,slime-heart,singing-birds-owl,water-organ,hydraulophone,glass-toilet,hellbrunn-fountains,ringing-bubbles,sloshing-resonance,tsunami-runup,blowhole,perpetual-motion').split(',');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{try{let f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+'/'))return res.writeHead(403).end();res.writeHead(200,{'Content-Type':mime[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}});
(async()=>{let browser;try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({...launchOptions,args:['--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run']});let page=await browser.newPage({viewport:{width:1120,height:760},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.bringToFront();await page.goto(`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=${ids[0]}&paused=1`);let results=[];
 for(let [index,id]of ids.entries()){
  if(index)await page.evaluate(id=>__toy.machine(id),id);await page.waitForFunction(()=>__toy.machineState()?.ready&&__toy.runtime(),{},{timeout:40000});
  let before=await page.evaluate(()=>__toy.runtime().stats());assert(before.finite,`${id} finite on entry`);
  await page.evaluate(()=>__toy.pause(false));
  if(id==='glass-toilet'){await page.locator('.toy-scene-action[data-control="primary"]').click();}
  if(id==='slime-heart'){let box=await page.locator('.toy-scene-action[data-control="primary"]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();}
  if(id==='tsunami-runup')await page.locator('.toy-scene-action[data-control="workshop-pulse"]').click();
  if(id==='water-organ'){await page.locator('.toy-scene-action[data-control="primary"]').click();await page.locator('.toy-scene-action[data-control="workshop-key-1"]').click();}
  if(id==='ringing-bubbles')await page.locator('.toy-scene-action[data-control="workshop-sound"]').click();
  await page.waitForTimeout(id==='blowhole'?6000:1500);await page.evaluate(()=>__toy.pause(true));
  let after=await page.evaluate(()=>__toy.runtime().stats());assert(after.finite,`${id} remains finite`);assert(after.t>before.t||after.clock>before.clock,`${id} actually advances`);
  if(after.massError!==undefined)assert(Math.abs(after.massError)<1e-9,`${id} water inventory`);
  if(id==='water-organ'){assert.equal(after.audio.enabled,true);assert(after.audio.voices>=2);assert.equal(after.voices.filter(v=>v.active).length,2);}
  if(id==='slime-heart')assert(after.pumped>0);
  let time=after.t??after.clock;await page.waitForTimeout(160);assert.equal(await page.evaluate(()=>{let s=__toy.runtime().stats();return s.t??s.clock;}),time,`${id} pause freezes state`);
  await page.screenshot({path:path.join(dump,id+'.png')});results.push({id,before,after});console.log('PASS',id,JSON.stringify({t:after.t,clock:after.clock,samples:after.samples,runup:after.runup,spout:after.spout,bubbleEvents:after.bubbleEvents}));
 }

 if(process.env.NATIVE_CONTROLS){
  async function trial(id,options,seconds,control){await page.evaluate(({id,options})=>__toy.machine(id,options),{id,options});await page.waitForFunction(()=>__toy.machineState()?.ready&&__toy.runtime());if(control)await page.locator('.toy-scene-action[data-control="'+control+'"]').click();await page.evaluate(()=>__toy.pause(false));await page.waitForFunction(seconds=>__toy.runtime().stats().clock>=seconds,seconds,{timeout:60000});await page.evaluate(()=>__toy.pause(true));return page.evaluate(()=>({runtime:__toy.runtime().stats(),boundary:__toy.nativeBoundary()?.stats(),particles:__toy.machineState().initialParticles}));}
  const still=await trial('sloshing-resonance',{motor:false},8),driven=await trial('sloshing-resonance',{},8);console.log('SLOSH COMPARISON',JSON.stringify([still.runtime.amplitude,driven.runtime.amplitude]));assert(driven.runtime.amplitude>still.runtime.amplitude+4,'motor creates larger measured sloshing');
  const calm=await trial('blowhole',{motor:false},10),spout=await trial('blowhole',{},10);console.log('SPOUT RAW',calm.runtime.spout,spout.runtime.spout);assert(spout.runtime.spout>8,'real water exits the roof spout');assert(calm.runtime.spout<spout.runtime.spout*.35,'stationary paddle does not produce the driven spout');console.log('SPOUT COMPARISON',JSON.stringify([calm.runtime.spout,spout.runtime.spout]));
  const beach=await trial('tsunami-runup',{},6),pulse=await trial('tsunami-runup',{},6,'workshop-pulse');assert(pulse.runtime.runup>beach.runtime.runup+5,'one wave increases real run-up');assert.equal(pulse.runtime.wave.motor,false,'single pulse stops after one motor cycle');console.log('RUNUP COMPARISON',JSON.stringify([beach.runtime.runup,pulse.runtime.runup]));
  const empty=await trial('hellbrunn-fountains',{guests:false},2,'workshop-trick'),guests=await trial('hellbrunn-fountains',{},2,'workshop-trick');assert.equal(empty.boundary.tapEnabled,false);assert(guests.boundary.admitted>empty.boundary.admitted+100,'seated native guest activates actual water source');console.log('GUEST COMPARISON',JSON.stringify([empty.boundary.admitted,guests.boundary.admitted]));
  const finite=await trial('perpetual-motion',{},10);assert.equal(finite.runtime.particleCount,finite.particles,'finite machine never gains or removes parcels');assert(finite.runtime.energyIndex<finite.runtime.energyInitial*.9,'finite apparatus loses its initial energy');console.log('FINITE ENERGY',JSON.stringify([finite.runtime.energyInitial,finite.runtime.energyIndex]));
  results.push({nativeComparisons:{still,driven,calm,spout,beach,pulse,empty,guests,finite}});
 }
 if(ids.includes('slime-heart')){await page.setViewportSize({width:844,height:390});await page.evaluate(()=>__toy.machine('slime-heart'));await page.waitForFunction(()=>__toy.machineState()?.ready);await page.screenshot({path:path.join(dump,'heart-landscape.png')});let boxes=await page.locator('.toy-scene-action').evaluateAll(nodes=>nodes.map(n=>({h:n.getBoundingClientRect().height,w:n.getBoundingClientRect().width})));assert(boxes.every(b=>b.h>=44&&b.w>=44),'landscape controls retain 44px targets');}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(dump,'results.json'),JSON.stringify(results,null,2));console.log('PASS: workshop native/reduced boot, real controls, finite state, conservation, pause, scene cleanup and landscape targets.');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
