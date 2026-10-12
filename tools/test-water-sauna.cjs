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
    await page.goto(`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=slime-sauna&paused=1`);
    await page.waitForFunction(()=>window.__toy?.machineState()?.ready,{},{timeout:25000});
    await page.evaluate(()=>__toy.liquid().device.addEventListener('uncapturederror',e=>window.__saunaGpuError=e.error.message));
    const before=await page.evaluate(()=>__toy.sauna().stats());console.log('BEFORE',JSON.stringify(before));
    await page.evaluate(()=>{__toy.pause(false);__toy.machinePrimary();});
    await page.waitForFunction(()=>__toy.sauna().stats().evaporatedParcels>20,{},{timeout:18000});
    await page.waitForTimeout(3500);
    const first=await page.evaluate(()=>__toy.sauna().stats());console.log('FIRST POUR',JSON.stringify(first));
    assert(first.stonesC<before.stonesC);assert(first.steamSamples>0);assert(first.roomC>20);assert(first.guests[0].temperatureC>20);
    await page.evaluate(()=>{__toy.machinePrimary();__toy.machinePrimary();});
    await page.waitForFunction(()=>__toy.sauna().stats().guests[0].mood==='Too hot',{},{timeout:14000});
    await page.evaluate(()=>__toy.pause(true));
    const hot=await page.evaluate(()=>__toy.sauna().stats());console.log('REPEATED POURS',JSON.stringify(hot));
    assert(hot.evaporatedParcels>first.evaporatedParcels);assert(hot.guests[0].mood==='Too hot');
    assert(hot.guests.every(g=>Number.isFinite(g.x+g.y+g.temperatureC)));assert(Math.abs(hot.heatResidualJ)<30);
    await page.screenshot({path:path.join(process.env.DUMP||'/tmp','sauna-quick-check.png')});
    assert.equal(await page.evaluate(()=>window.__saunaGpuError||__toy.instruments().error||null),null);assert.deepEqual(errors,[]);
    const paused=hot.roomC;await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>__toy.sauna().stats().roomC),paused);
    await page.evaluate(()=>__toy.machine('douse-fire'));
    assert.equal(await page.evaluate(()=>__toy.sauna()),null);
    console.log('PASS: contact, evaporation, warming, hot reaction, pause and scene cleanup.');
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
