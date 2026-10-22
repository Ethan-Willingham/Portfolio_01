/* Persistent navigation, actual shoreline agreement, paused pixels and compact HUD layout. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-minimap');fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'}).end(e?'Missing':data);});});
let browser;const errors=[],reports=[];
async function fit(page){
  const r=await page.evaluate(()=>{const map=document.getElementById('reach-minimap').getBoundingClientRect(),overlap=[];for(const id of ['vessel-status','reach-pause','sailing-actions','context-action','reach-course','work-status','combat-status']){const e=document.getElementById(id);if(e.hidden||!e.getClientRects().length)continue;const b=e.getBoundingClientRect();if(Math.min(map.right,b.right)>Math.max(map.left,b.left)&&Math.min(map.bottom,b.bottom)>Math.max(map.top,b.top))overlap.push(id);}return{inside:map.x>=0&&map.y>=0&&map.right<=innerWidth&&map.bottom<=innerHeight,overlap,width:map.width,height:map.height};});
  assert.ok(r.inside,'map fits viewport');assert.deepEqual(r.overlap,[],'map leaves instruments and actions reachable');return r;
}
(async()=>{try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true});
  for(const [name,width,height,touch,canvas]of [['desktop',1440,900,false,false],['phone',844,390,true,false],['small-phone',667,375,true,false],['canvas',844,390,true,true]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:touch?2:1}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    if(canvas)await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /^webgl/.test(kind)?null:get.call(this,kind,...args);};});
    await page.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await page.waitForFunction(()=>window.__widewakeReach);
    assert.equal(await page.locator('#reach-minimap').isVisible(),false);
    await page.click('#start-voyage');await page.waitForFunction(()=>__widewakeReach.view?.terrain.ready,null,{timeout:60000});assert.equal(await page.locator('#reach-minimap').isVisible(),false,'hidden in harbor');
    await page.click('#cast-off');await page.waitForFunction(()=>__widewakeReach.minimap.stats.draws>0);assert.ok(await page.locator('#reach-minimap').isVisible());await fit(page);
    const zoomIn=page.locator('[data-minimap-zoom="in"]'),zoomOut=page.locator('[data-minimap-zoom="out"]'),press=locator=>touch?locator.tap():locator.click();
    for(const button of [zoomIn,zoomOut]){const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44,'minimap zoom has a full touch target');}
    const cameraZoom=await page.evaluate(()=>__widewakeReach.view.targetZoom);await press(zoomIn);assert.equal(await page.evaluate(()=>__widewakeReach.minimap.span),1000);await press(zoomOut);assert.equal(await page.evaluate(()=>__widewakeReach.minimap.span),2000);assert.equal(await page.evaluate(()=>__widewakeReach.view.targetZoom),cameraZoom,'minimap zoom leaves the camera alone');
    if(name==='desktop'){
      while(!await zoomIn.isDisabled())await press(zoomIn);assert.equal(await page.evaluate(()=>__widewakeReach.minimap.span),500);
      while(!await zoomOut.isDisabled())await press(zoomOut);assert.equal(await page.evaluate(()=>__widewakeReach.minimap.span),16000);
      await zoomIn.focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>__widewakeReach.minimap.span),8000);
      for(let i=0;i<2;i++)await press(zoomIn);assert.equal(await page.evaluate(()=>__widewakeReach.minimap.span),2000);
    }
    await page.click('#reach-pause');const frozen=await page.locator('#reach-minimap-map').evaluate(c=>c.toDataURL());await page.waitForTimeout(250);assert.equal(await page.locator('#reach-minimap-map').evaluate(c=>c.toDataURL()),frozen,'paused map stays frozen');
    const navigation=await page.evaluate(()=>{
      const h=__widewakeReach,m=h.minimap,g=h.game,p=g.player,bakes=m.stats.bakes;
      const before=m.context.getImageData(Math.floor(m.canvas.width/2)-16,Math.floor(m.canvas.height/2)-16,32,32).data.join(',');p.angle+=Math.PI/2;m.draw(g,performance.now(),true);
      const after=m.context.getImageData(Math.floor(m.canvas.width/2)-16,Math.floor(m.canvas.height/2)-16,32,32).data.join(',');
      p.x+=100;p.y-=100;m.draw(g,performance.now(),true);const centered=m.point(p.x,p.y),size=m.canvas.clientWidth;
      let checked=0,matched=0;const ratio=m.canvas.width/size;
      for(let y=30;y<size-28;y+=7)for(let x=8;x<size-25;x+=7){if(Math.hypot(x-size/2,y-size/2)<12)continue;const w=g.field.sample(p.x+(x-size/2)/size*m.span,p.y+(y-size/2)/size*m.span);if(Math.abs(w.edge)<45)continue;const c=m.context.getImageData(Math.round(x*ratio),Math.round(y*ratio),1,1).data,water=c[2]>c[0];checked++;if(water===(w.depth>0))matched++;}
      const destination=WidewakeEstuary.ports.find(d=>d.id==='lantern');g.route={destination,points:[{x:p.x+200,y:p.y-200},destination],index:0};m.draw(g,performance.now(),true);
      return{turnChanged:before!==after,centered,half:size/2,bakes:m.stats.bakes-bakes,shoreline:{checked,matched},target:m.target.id,caption:m.caption.textContent};
    });
    assert.ok(navigation.turnChanged,'player arrow turns with heading');assert.deepEqual(navigation.centered,{x:navigation.half,y:navigation.half});assert.equal(navigation.bakes,0,'moving and turning reuse the static atlas');assert.ok(navigation.shoreline.checked>30&&navigation.shoreline.matched/navigation.shoreline.checked>.94,'map water agrees with navigable terrain: '+JSON.stringify(navigation));assert.equal(navigation.target,'lantern');assert.match(navigation.caption,/Lantern Quay/);
    await page.click('#reach-resume');await page.keyboard.press('m');assert.ok(await page.locator('#reach-chart').isVisible(),'full chart still available');await page.click('[data-close="reach-chart"]');
    await page.evaluate(()=>{const h=__widewakeReach;h.game.route=null;h.game.player.x=350;h.game.player.y=1700;h.game.player.vx=h.game.player.vy=0;h.view.camera={x:350,y:1700};h.minimap.draw(h.game,performance.now(),true);});
    await page.screenshot({path:path.join(out,name+'-sailing.png')});
    if(name==='small-phone')for(const h of [320,272,240,height]){await page.setViewportSize({width,height:h});await page.evaluate(()=>__widewakeReach.view.resize());await fit(page);assert.ok(await page.locator('#reach-minimap-map').isVisible(),'map survives a reduced browser-toolbar viewport');for(const button of [zoomIn,zoomOut]){const box=await button.boundingBox();assert.ok(box.width>=44&&box.height>=44,'short viewport keeps full-sized zoom buttons');}}
    await page.click('#reach-pause');await page.click('#menu-combat');await page.waitForFunction(()=>__widewakeReach.game?.endgame&&__widewakeReach.minimap.span===8000);await fit(page);await page.screenshot({path:path.join(out,name+'-combat.png')});
    const combat=await page.evaluate(()=>{const h=__widewakeReach,m=h.minimap;return{samples:m.stats.enemySamples,cells:m.stats.threatCells,span:m.span,fleet:h.game.ships.length,backend:h.view.stats.backend};});assert.ok(combat.samples>=16000);assert.ok(combat.cells>0&&combat.cells<=1024);assert.equal(combat.fleet,24);if(canvas)assert.match(combat.backend,/Canvas/i);
    await press(zoomIn);assert.equal(await page.evaluate(()=>__widewakeReach.minimap.span),4000);await press(zoomOut);assert.equal(await page.evaluate(()=>__widewakeReach.minimap.span),8000);
    await page.click('#reach-pause');await page.click('#return-title');assert.equal(await page.locator('#reach-minimap').isVisible(),false,'hidden on return to title');
    reports.push({name,...navigation,combat});await context.close();console.log('PASS '+name+' sailing, chart, heading, coastlines, combat, pause and HUD fit');
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2));console.log('Artifacts: '+out);
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
