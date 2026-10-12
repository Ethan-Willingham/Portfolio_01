// Wet/dry smoke transport, native water placement and visible comparison controls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
const {chromium,launchOptions}=require('./under-street/browser-support.cjs');
const output=process.env.DUMP||'/tmp/sewer-trap-review';
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
  try{
    const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
    const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(fs.readFileSync(file));
  }catch{res.writeHead(404).end();}
});
(async()=>{
  let browser;
  const reports=[],errors=[];
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({...launchOptions,args:['--enable-unsafe-webgpu','--use-angle=metal','--disable-gpu-sandbox','--no-first-run']});
    let page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
    page.on('pageerror',e=>errors.push(e.message));
    async function advance(seconds){
      const end=await page.evaluate(()=>__toy.fireSmokeDraft().stats(false).seconds)+seconds;
      await page.waitForFunction(end=>__toy.fireSmokeDraft().stats(false).seconds>=end,end,{timeout:60000});
    }
    async function capture(name){
      const report=await page.evaluate(()=>{
        const T=__toy,d=T.machineState().definition,n=T.stats().water;
        let outside=0,minY=Infinity,maxY=-Infinity;
        for(let i=0;i<n;i++){
          const p=T.mirror(i);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);
          // The leg bores extend to x=288 and x=416. This open space above
          // their connecting pipe must never hold the old accidental pool.
          if(p.x>300 && p.x<412 && p.y<276)outside++;
        }
        const b=document.querySelector('.toy-scene-action[data-control="primary"]'),r=b.getBoundingClientRect(),label=b.firstElementChild;
        return {setup:d.setup,water:n,outside,minY,maxY,smoke:T.fireSmokeDraft().stats(true),
          label:b.textContent,labelOpacity:getComputedStyle(label).opacity,
          control:{x:r.x,y:r.y,width:r.width,height:r.height,hidden:b.hidden},
          status:document.getElementById('toy-status').textContent,error:T.instruments().error||null};
      });
      reports.push({name,...report});console.log(name,JSON.stringify({setup:report.setup,water:report.water,outside:report.outside,seconds:report.smoke.seconds,probes:report.smoke.probes,regions:report.smoke.regions}));
      assert.equal(report.outside,0,'no water sitting above the inner pipe wall');
      assert.equal(report.labelOpacity,'1','comparison control is visible without hovering');
      assert(!report.control.hidden && report.control.width>=44 && report.control.height>=44,'control has a visible touch target');
      const view=page.viewportSize();
      assert(report.control.x>=0 && report.control.y>=0 && report.control.x+report.control.width<=view.width+.5 && report.control.y+report.control.height<=view.height+.5,'control stays within the viewport');
      assert(!report.status.includes('Waiting'),'there is no misleading pressure wait');
      assert.equal(report.error,null);
      await page.screenshot({path:path.join(output,name+'.png')});return report;
    }
    function dye(report,id){return report.smoke.probes.find(p=>p.id===id).dye;}
    function sealed(report){
      assert(report.water>5000,'wet trap retains native water');
      assert(dye(report,'sewer')>.02,'incoming smoke is visible');
      assert(dye(report,'bend')<1e-6 && dye(report,'room-outlet')<1e-6 && dye(report,'room-plume')<1e-6,'water stops dye transport through the bend and into the room');
      assert(report.smoke.regions[0].maxDye<1e-6,'the room stays clear');
    }
    function dry(report){
      assert.equal(report.water,0,'dry button removes all water');
      assert(dye(report,'room-outlet')>.015 && report.smoke.regions[0].maxDye>.02 && report.smoke.regions[0].meanDye>.003,'actual smoke passes through the pipe and emerges in the room');
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=sewer-gas-trap&paused=1`);
    await page.waitForFunction(()=>window.__toy?.machineState()?.ready,{},{timeout:25000});
    await page.evaluate(()=>__toy.liquid().device.addEventListener('uncapturederror',e=>window.__trapGpuError=e.error.message));
    await capture('wet-initial');await page.evaluate(()=>__toy.pause(false));
    await advance(6);sealed(await capture('desktop-wet'));
    await advance(24);sealed(await capture('desktop-wet-long'));
    await page.getByRole('button',{name:'Dry out trap',exact:true}).click();
    await page.waitForFunction(()=>__toy.machineState()?.ready&&__toy.machineState().definition.setup==='dry');
    await advance(12);dry(await capture('desktop-dry'));
    await page.getByRole('button',{name:'Refill trap',exact:true}).click();
    await page.waitForFunction(()=>__toy.machineState()?.ready&&__toy.machineState().definition.setup==='wet');
    await advance(8);sealed(await capture('desktop-refilled'));
    // Keyboard controls work while paused, and switching keeps manual pause.
    await page.getByRole('button',{name:'Pause',exact:true}).click();
    await page.getByRole('button',{name:'Dry out trap',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>__toy.machineState()?.ready&&__toy.machineState().definition.setup==='dry');
    assert(await page.evaluate(()=>__toy.stats().paused));
    assert.equal((await capture('paused-dry')).water,0);
    await page.getByRole('button',{name:'Refill trap',exact:true}).click();
    await page.waitForFunction(()=>__toy.machineState()?.ready&&__toy.machineState().definition.setup==='wet');
    assert(await page.evaluate(()=>__toy.stats().paused));
    await page.setViewportSize({width:480,height:760});
    await page.waitForFunction(()=>{const r=document.querySelector('.toy-scene-action').getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+.5&&r.y>=0&&r.bottom<=innerHeight+.5;});
    await capture('narrow-desktop');
    await page.close();
    const mobile=await browser.newPage({viewport:{width:844,height:390},deviceScaleFactor:1,isMobile:true,hasTouch:true,
      userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
    mobile.on('pageerror',e=>errors.push(e.message));
    await mobile.goto(`http://127.0.0.1:${server.address().port}/archive/water-smoke-slime/water-smoke-slime.html?scene=sewer-gas-trap`);
    await mobile.waitForFunction(()=>window.__toy?.machineState()?.ready,{},{timeout:25000});
    // The same helpers inspect desktop and touch using the current page.
    page=mobile;
    await advance(8);sealed(await capture('mobile-wet'));
    await mobile.getByRole('button',{name:'Dry out trap',exact:true}).tap();
    await mobile.waitForFunction(()=>__toy.machineState()?.ready&&__toy.machineState().definition.setup==='dry');
    await advance(16);dry(await capture('mobile-dry'));
    await mobile.getByRole('button',{name:'Refill trap',exact:true}).tap();
    await mobile.waitForFunction(()=>__toy.machineState()?.ready&&__toy.machineState().definition.setup==='wet');
    await advance(8);sealed(await capture('mobile-refilled'));
    await mobile.getByRole('button',{name:'Instruments',exact:true}).tap();
    const visibleText=await mobile.locator('#toy-panel-instruments').innerText();
    assert(!visibleText.includes('Waiting') && !visibleText.includes('straw'),'instruments describe this smoke comparison');
    // Leaving the trap restores its smoke options for other draft scenes.
    await mobile.evaluate(()=>__toy.machine('candle-in-jar'));
    await mobile.waitForFunction(()=>__toy.machineState()?.ready&&__toy.machineState().definition.name==='candle-in-jar');
    await mobile.waitForTimeout(1000);
    assert.equal(await mobile.evaluate(()=>__toy.instruments().error||null),null);
    assert.equal(await page.evaluate(()=>window.__trapGpuError||null),null);assert.deepEqual(errors,[]);
    console.log('PASS: water blocks smoke; dry trap emits smoke into the room; desktop, touch, keyboard, pause and refill verified.');
  }finally{
    fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({reports,errors},null,2));
    if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
