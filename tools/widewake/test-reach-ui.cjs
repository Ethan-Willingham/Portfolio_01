/* UI decisions must work with a real pointer, keyboard and controller focus.
   Fixtures expose later services; they do not stand in for earned progression. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,webkit}=require('playwright'),root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||'/tmp/widewake-v024/ui';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{res.writeHead(e?404:200,{'Content-Type':({'.html':'text/html','.css':'text/css','.js':'text/javascript','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream'});res.end(e?'Missing':data);});});
let browser;const errors=[],reports=[],isWebkit=process.env.WIDEWAKE_TEST_ENGINE==='webkit';
const ready=p=>p.waitForFunction(()=>__widewakeReach.view?.terrain.ready,null,{timeout:45000});
async function shot(p,name){await p.screenshot({path:path.join(out,name+'.png')});}
async function targetCheck(p,scope,{all=true}={}){
  const size=p.viewportSize(),targets=await p.locator(scope).evaluate(scope=>{
    const result=[];
    for(const e of scope.querySelectorAll('button,summary')){
      if(!e.getClientRects().length||e.closest('[hidden]')||getComputedStyle(e).visibility==='hidden')continue;
      const r=e.getBoundingClientRect();let left=r.left,right=r.right,top=r.top,bottom=r.bottom,hidden=false;
      for(let n=e.parentElement;n;n=n.parentElement){
        if(n.tagName==='DETAILS'&&!n.open&&!n.querySelector(':scope > summary')?.contains(e)){hidden=true;break;}
        const style=getComputedStyle(n),box=n.getBoundingClientRect();
        // Scrolled-off rows have rectangles but do not paint over the fixed footer.
        if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,box.left);right=Math.min(right,box.right);}
        if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}
      }
      if(hidden||right<=left||bottom<=top)continue;
      result.push({id:e.id||JSON.stringify(e.dataset)||e.textContent,x:left,y:top,w:right-left,h:bottom-top,targetWidth:r.width,targetHeight:r.height});
    }
    return result;
  });
  for(const r of targets){assert.ok(r.targetWidth>=43&&r.targetHeight>=43,'small target '+JSON.stringify(r));assert.ok(r.x>=0&&r.x+r.w<=size.width+1,'horizontal overflow '+JSON.stringify(r));if(all)assert.ok(r.y>=0&&r.y+r.h<=size.height+1,'vertical overflow '+JSON.stringify(r));}
  for(let i=0;i<targets.length;i++)for(let j=i+1;j<targets.length;j++){const a=targets[i],b=targets[j];assert.ok(a.x+a.w<=b.x+.5||b.x+b.w<=a.x+.5||a.y+a.h<=b.y+.5||b.y+b.h<=a.y+.5,'overlap '+a.id+'/'+b.id);}
  return targets.length;
}

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port+'/widewake.html?test';
  browser=await(isWebkit?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'}));
  const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.click('#start-voyage');await ready(p);
  await targetCheck(p,'#port-scene');await p.click('[data-service="fleet"]');assert.match(await p.textContent('#service-body'),/Sell 8 salt at Reed Landing/);await p.click('[data-job="chart"]');await p.waitForFunction(()=>!document.getElementById('set-course').disabled);assert.equal(await p.getAttribute('[data-port="reeds"]','aria-pressed'),'true');await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>__widewakeReach.mode),'port');
  await p.click('[data-service="trade"]');await p.click('[data-qty="max"]');assert.equal(await p.textContent('.quantity-row output'),'24');await p.click('[data-trade="buy"]');assert.deepEqual(await p.evaluate(()=>({salt:__widewakeReach.game.amount('salt'),cargo:__widewakeReach.game.cargo,capacity:__widewakeReach.game.capacity})),{salt:32,cargo:32,capacity:32});assert.equal(await p.locator('[data-trade="buy"]').isDisabled(),true);assert.match(await p.textContent('.order-note'),/room/);
  await p.click('[data-side="sell"]');await p.click('[data-qty="max"]');assert.equal(await p.textContent('.quantity-row output'),'32');await p.click('[data-trade="sell"]');assert.equal(await p.evaluate(()=>__widewakeReach.game.amount('salt')),0);assert.equal(await p.locator('[data-trade="sell"]').isDisabled(),true);assert.match(await p.textContent('.order-note'),/None aboard/);
  await p.click('[data-side="buy"]');await p.click('[data-good="tools"]');await p.click('[data-qty="max"]');const maximum=await p.evaluate(()=>({n:+document.querySelector('.quantity-row output').textContent,coins:__widewakeReach.game.coins}));assert.ok(maximum.n>0);assert.ok(await p.evaluate(n=>__widewakeReach.game.quote('tools',n,true)<=__widewakeReach.game.coins,maximum.n));assert.ok(await p.evaluate(n=>__widewakeReach.game.quote('tools',n+1,true)>__widewakeReach.game.coins,maximum.n));await p.click('[data-trade="buy"]');await shot(p,'trade');await p.click('[data-close="port-service"]');
  // Later service art is the actual ship geometry, and ships remain individually readable.
  await p.evaluate(()=>{const g=__widewakeReach.game;g.rank=4;g.coins=30000;g.hire('trawler');g.collection=['Glass mullet','Copper pike','Amber nautilus'];});await p.waitForTimeout(180);await p.click('[data-service="fleet"]');assert.equal(await p.locator('[data-hire]').count(),6);await shot(p,'fleet');assert.ok(await p.evaluate(()=>[...document.querySelectorAll('canvas[data-vessel]')].every(c=>{const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i])n++;return n>100;})));
  await p.click('[data-service-tab="owned"]');await shot(p,'owned');await p.click('[data-close="port-service"]');await p.click('[data-service="yard"]');const before=await p.evaluate(()=>__widewakeReach.game.player.speed);await p.click('[data-upgrade="engine"]');assert.ok(await p.evaluate(v=>__widewakeReach.game.player.speed>v,before));assert.match(await p.textContent('#service-feedback'),/fitted/);await shot(p,'fittings');await p.click('[data-service-tab="hulls"]');await shot(p,'hulls');await p.click('[data-close="port-service"]');await p.click('[data-service="log"]');await shot(p,'logbook');await p.click('[data-close="port-service"]');
  await p.click('#harbor-chart');await p.click('[data-port="mill"]');await p.waitForFunction(()=>!document.getElementById('set-course').disabled);await shot(p,'chart');await p.keyboard.press('Escape');
  // Native details are also reachable by controller. Nested help returns to pause.
  await p.click('#reach-pause');assert.equal(await p.getAttribute('#settings-fold','open'),null);assert.equal(await p.locator('#saves-fold').count(),0);await shot(p,'pause');await p.click('#reach-help');await p.keyboard.press('Escape');assert.equal(await p.locator('#reach-menu').isVisible(),true);
  await p.evaluate(()=>{const c=__widewakeReach.controller;c.focus(document.querySelector('#settings-fold > summary'));c.confirm(document.getElementById('reach-menu'));});assert.notEqual(await p.getAttribute('#settings-fold','open'),null);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>__widewakeReach.mode),'port');
  await p.click('#cast-off');await p.click('#camera-toggle');assert.equal(await p.getAttribute('#camera-toggle','aria-expanded'),'true');await p.click('[data-zoom="survey"]');assert.equal(await p.locator('#camera-controls').isVisible(),false);assert.equal(await p.getAttribute('[data-zoom="survey"]','aria-pressed'),'true');await p.keyboard.press('Space');assert.equal(await p.getAttribute('#camera-toggle','aria-expanded'),'true');assert.equal(await p.evaluate(()=>__widewakeReach.game.burstCooldown),0);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>__widewakeReach.mode),'sailing');assert.equal(await p.locator('#camera-controls').isVisible(),false);await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>__widewakeReach.mode),'menu');await context.close();
  console.log('PASS locked preview route, buy/sell limits, actual fleet art, fittings, chart, nested menus and camera focus');
  for(const [width,height]of [[390,844],[844,390],[667,375],[360,740],[568,320]]){
    const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true}),t=await ctx.newPage();t.on('pageerror',e=>errors.push(e.message));await t.goto(url);await t.tap('#start-voyage');await ready(t);const harborTargets=await targetCheck(t,'#port-scene');await shot(t,`port-${width}x${height}`);
    await t.tap('[data-service="trade"]');await targetCheck(t,'#port-service',{all:height>500});await t.tap('[data-side="sell"]');await t.tap('[data-trade="sell"]');assert.equal(await t.evaluate(()=>__widewakeReach.game.amount('salt')),0);await t.tap('[data-side="buy"]');await t.tap('[data-qty="max"]');await t.tap('[data-trade="buy"]');await shot(t,`trade-${width}x${height}`);await t.tap('[data-close="port-service"]');
    await t.evaluate(()=>{const g=__widewakeReach.game;g.rank=4;g.coins=20000;g.changeHull('flagship');});await t.tap('[data-service="fleet"]');await t.locator('[data-hire="battery"]').scrollIntoViewIfNeeded();await t.tap('[data-hire="battery"]');assert.equal(await t.evaluate(()=>__widewakeReach.game.ships.length),2);await shot(t,`fleet-${width}x${height}`);await t.tap('[data-close="port-service"]');
    await t.tap('#cast-off');await ready(t);await targetCheck(t,'#reach');await t.tap('#camera-toggle');await targetCheck(t,'#reach');await shot(t,`sailing-${width}x${height}`);await t.tap('[data-zoom="fleet"]');await t.tap('#chart-open');await t.tap('[data-port="mill"]');await t.waitForFunction(()=>!document.getElementById('set-course').disabled);await targetCheck(t,'#reach-chart',{all:height>500});await shot(t,`chart-${width}x${height}`);await t.locator('[data-port="oil"]').scrollIntoViewIfNeeded();await t.tap('[data-port="oil"]');await t.waitForFunction(()=>!document.getElementById('set-course').disabled);assert.equal(await t.getAttribute('[data-port="oil"]','aria-pressed'),'true');await targetCheck(t,'#reach-chart',{all:height>500});await t.tap('[data-close="reach-chart"]');
    await t.tap('#reach-pause');assert.equal(await t.locator('#export-save,#import-save,#reverse,#tow').count(),0);await t.keyboard.press('Escape');reports.push({width,height,harborTargets});await ctx.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({engine:isWebkit?'webkit':'chromium',reports,errors},null,2));console.log('PASS five phone layouts, accessible transaction actions, later fleets, camera controls and simplified menus');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
