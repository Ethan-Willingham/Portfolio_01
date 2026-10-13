// One small owned-browser check for the sauna interaction. No scene matrix.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const {chromium,launchOptions}=require(root+'/tools/under-street/browser-support.cjs');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  try{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+'/'))return res.writeHead(403).end();
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
  }catch{res.writeHead(404).end();}
});
(async()=>{
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({...launchOptions,args:['--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run']});
    const page=await browser.newPage({viewport:{width:960,height:620},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.bringToFront();
    await page.goto(`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=slime-sauna&paused=1`);
    await page.waitForFunction(()=>window.__toy?.machineState()?.ready,{},{timeout:25000});
    await page.evaluate(()=>__toy.liquid().device.addEventListener('uncapturederror',e=>window.__saunaGpuError=e.error.message));
    const before=await page.evaluate(()=>__toy.sauna().stats());console.log('BEFORE',JSON.stringify(before));
    const pour=page.locator('.toy-scene-action[data-control="primary"]');
    const point=await pour.boundingBox();assert(point,'held pour control is visible');
    await page.mouse.move(point.x+point.width/2,point.y+point.height/2);
    await page.evaluate(()=>__toy.pause(false));await page.mouse.down();
    await page.waitForTimeout(400);await page.mouse.up();
    await page.waitForFunction(()=>__toy.sauna().stats().evaporatedParcels>20,{},{timeout:18000});
    await page.waitForTimeout(3500);
    const first=await page.evaluate(()=>__toy.sauna().stats());console.log('FIRST POUR',JSON.stringify(first));
    assert(first.stonesC<before.stonesC);assert(first.steamSamples>0);assert(first.roomC>20);assert(first.guests[0].temperatureC>20);
    await page.mouse.down();
    await page.waitForTimeout(3500);
    await page.mouse.up();
    await page.evaluate(()=>__toy.pause(true));
    const hot=await page.evaluate(()=>__toy.sauna().stats());console.log('REPEATED POURS',JSON.stringify(hot));
    assert(hot.evaporatedParcels>=first.evaporatedParcels);assert(hot.waterHeatJ>first.waterHeatJ);assert(hot.guests[0].temperatureC>20);
    assert(hot.stonesC<first.stonesC,'repeated cold water draws down finite stored heat');
    assert(hot.guests.every(g=>Number.isFinite(g.x+g.y+g.temperatureC)));assert(Math.abs(hot.heatResidualJ)<30);
    // Copy both reservoirs after their last exchange. Their asynchronous
    // display readings otherwise fall on opposite sides of the heat pass.
    const energy=await page.evaluate(async()=>{
      const L=__toy.liquid(),fuel=__toy.fire().heatState(),stone=__toy.sauna().heatState();
      const read=L.device.createBuffer({size:128,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
      try{
        const encoder=L.device.createCommandEncoder();encoder.copyBufferToBuffer(fuel.buffer,0,read,0,96);encoder.copyBufferToBuffer(stone.buffer,0,read,96,32);
        L.queue.submit([encoder.finish()]);await read.mapAsync(GPUMapMode.READ);
        const values=new Float32Array(read.getMappedRange()).slice(),f=values.slice(0,24),s=values.slice(24);
        __toy.oxygen().capture();
        return {fuelTransferredJ:f[21],stonesReceivedJ:s[1],fuelChemicalJ:f[4],oxygenChemicalJ:__toy.oxygen().stats().chemicalHeatJ,
          combinedResidualJ:f[16]+f[4]+stone.capacity*(340-20)-f[5]-f[6]-s[2]-s[3]-fuel.capacity*(f[0]-20)-stone.capacity*(s[0]-20)};
      }finally{read.destroy();}
    });
    console.log('COUPLED ENERGY',JSON.stringify(energy));
    assert(Math.abs(energy.fuelTransferredJ-energy.stonesReceivedJ)<.02,'fuel heat lost equals stone heat gained');
    assert(Math.abs(energy.combinedResidualJ)<30,'coupled reservoirs conserve energy');
    assert(energy.fuelChemicalJ<=energy.oxygenChemicalJ*.7+.1,'fuel input is bounded by actual oxygen reaction heat');
    await page.screenshot({path:path.join(process.env.DUMP||'/tmp','sauna-quick-check.png')});
    assert.equal(await page.evaluate(()=>window.__saunaGpuError||__toy.instruments().error||null),null);assert.deepEqual(errors,[]);
    const paused=hot.roomC;await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>__toy.sauna().stats().roomC),paused);
    await page.evaluate(()=>__toy.machine('douse-fire'));
    assert.equal(await page.evaluate(()=>__toy.sauna()),null);
    console.log('PASS: conservative fire-to-stone heat, contact, evaporation, warming, finite cooling, pause and scene cleanup.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
