/* Harbor progression, recovery access and locked-menu interaction contracts.
   Fixtures below isolate thresholds; test-browser and test-controller earn the loop. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,webkit}=require('playwright'),D=require('../../js/widewake-data.js'),W=require('../../js/widewake-world.js'),C=require('../../js/widewake-core.js');
const root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-harbor');fs.mkdirSync(out,{recursive:true});
const earth=new W.Earth(JSON.parse(fs.readFileSync(path.join(root,'assets/widewake/earth-land.geojson')))),ids=['trade','fleet','yard','voyage','jobs','log'];
const make=()=>new C.Game(earth),open=g=>ids.filter(id=>g.harborService(id).open);
{
 const g=make(),before=JSON.stringify(g.snapshot());assert.deepEqual(open(g),['trade','voyage']);assert.equal(g.harborService('bad'),null);assert.equal(JSON.stringify(g.snapshot()),before,'inspecting services cannot award progress');
 g.s.coins=1e6;assert.deepEqual(open(g),['trade','voyage'],'money alone does not open a service');
 g.s.xp=99;assert.equal(g.harborService('fleet').open,false);g.s.xp=100;assert.equal(g.harborService('fleet').open,true);assert.equal(g.harborService('yard').open,false);g.s.xp=450;assert.equal(g.harborService('yard').open,true);assert.equal(g.harborService('jobs').open,false);g.s.xp=1300;assert.equal(g.harborService('jobs').open,true);
 const restored=new C.Game(earth,g.snapshot());assert.deepEqual(open(restored),open(g));assert.equal(restored.s.stats.fish,0,'a trading or fighting captain can open the yard without fishing');
}
{
 const g=make();g.s.port='nassau';g.s.visits.push('nassau');assert.equal(g.harborService('log').open,true);assert.equal(g.harborService('fleet').open,false);assert.ok(g.trade('sugar',6,false));assert.equal(g.s.stats.sugar,6);assert.equal(g.harborService('fleet').open,true);
 g.s.xp=0;g.s.stats.fish=11;assert.equal(g.harborService('yard').open,false);g.s.stats.fish=12;assert.equal(g.harborService('yard').open,true);g.s.hull='brig';assert.ok(g.claimCharter());assert.equal(g.harborService('jobs').open,true);g.s.coins=0;g.s.fleet=[];g.fleet=[];assert.ok(['fleet','yard','jobs','log'].every(id=>g.harborService(id).open),'losses and spending do not close services');assert.deepEqual(open(new C.Game(earth,g.snapshot())),open(g));
}
for(const [change,service] of [
 [s=>s.nextUid=3,'fleet'],[s=>s.upgrades.guns=1,'yard'],[s=>s.hull='brig','yard'],[s=>s.items.push('brass'),'yard'],[s=>s.stats.rare=1,'log'],[s=>s.completedContracts.push('havana-1-0'),'jobs'],[s=>s.deliveries.push({id:'old-job',from:'havana',to:'nassau',good:'sugar',qty:6,reward:240}),'jobs']
]){const s=C.fresh();change(s);assert.ok(new C.Game(earth,s).harborService(service).open,'existing earned access: '+service);}
console.log('PASS fresh services, meaningful thresholds, alternate rank paths, immutable inspection, legacy purchases/contracts and permanent earned access');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.geojson':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);});});
let browser;const errors=[];
(async()=>{try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=process.env.WIDEWAKE_TEST_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing'});
 for(const [name,width,height,touch] of [['desktop',1440,900,false],['compact',800,600,false],['portrait',390,844,true],['small-portrait',360,640,true],['landscape',844,390,true],['small-landscape',667,375,true]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1}),p=await context.newPage();p.on('pageerror',error=>errors.push(error.message));
  await p.goto('http://127.0.0.1:'+server.address().port+'/widewake.html?test');await p.waitForFunction(()=>window.__widewake);await p.evaluate(()=>document.fonts.ready);
  const act=selector=>touch?p.tap(selector):p.click(selector),shot=s=>p.screenshot({path:path.join(out,name+'-'+s+'.png')});
  async function reachable(selector){const r=await p.locator(selector).boundingBox(),panel=await p.locator('#port-panel').boundingBox();assert.ok(r&&r.width>=44&&r.height>=44,name+' touch target '+selector);assert.ok(r.x>=0&&r.y>=panel.y&&r.x+r.width<=width+1&&r.y+r.height<=Math.min(height,panel.y+panel.height)+1,name+' preview action visible without scrolling '+selector);}
  await act('#start-voyage');await act('[data-close="departure-dialog"]');assert.equal(await p.locator('[data-tab][data-locked="true"]').count(),4);await shot('fresh');
  const before=await p.evaluate(()=>JSON.stringify(__widewake.game.snapshot()));
  for(const id of ['fleet','yard','jobs','log']){
   await act('[data-tab="'+id+'"]');assert.equal(await p.getAttribute('#port-panel','data-locked'),'true');assert.match(await p.getAttribute('[data-tab="'+id+'"]','aria-label'),/locked.*Preview unlock/);assert.equal(await p.locator('.ww-locked-service').count(),1);assert.equal(await p.locator('#port-panel [data-action="boat"], #port-panel [data-action="hull"], #port-panel [data-action="upgrade"], #port-panel [data-action="contract"]').count(),0);await reachable('.ww-unlock-actions .ww-primary');if(id==='yard')await shot('locked-yard');
  }
  assert.equal(await p.evaluate(()=>JSON.stringify(__widewake.game.snapshot())),before,'previews must not spend or unlock anything');
  await act('[data-tab="fleet"]');await act('[data-action="manage-boat"]');await p.evaluate(()=>{const g=__widewake.game;g.player.hp-=25;g.s.hp=g.player.hp;});await act('[data-convoy-action="select"][data-uid="0"]');const repair=await p.evaluate(()=>({cost:__widewake.game.repairCost(),coins:__widewake.game.s.coins}));await act('[data-convoy-action="repair"]');assert.equal(await p.evaluate(()=>__widewake.game.s.coins),repair.coins-repair.cost);assert.equal(await p.evaluate(()=>__widewake.game.needsRepair()),false);await act('[data-close="convoy-dialog"]');assert.equal(await p.getAttribute('#port-panel','data-locked'),'true');
  // A stale action cannot bypass a menu lock after a reset or import.
  await p.evaluate(()=>{const b=document.createElement('button');b.dataset.action='boat';b.dataset.id='trawler';document.getElementById('port-panel').append(b);b.click();});assert.equal(await p.evaluate(()=>__widewake.game.s.fleet.length),1);
  await act('.ww-unlock-actions .ww-primary');assert.equal(await p.inputValue('#destination-list'),'nassau');await act('[data-close="chart-dialog"]');
  // Threshold fixture leaves focus where the player put it, even as a tab opens.
  await act('[data-tab="trade"]');await act('[data-qty="1"]');await p.locator('[data-qty="1"]').focus();await p.evaluate(()=>{__widewake.game.s.xp=100;__widewake.render();});assert.equal(await p.getAttribute('[data-tab="fleet"]','data-locked'),'false');assert.equal(await p.getAttribute('[data-tab="fleet"]','data-new'),'true');assert.ok(await p.locator('[data-qty="1"]').evaluate(b=>b===document.activeElement));assert.equal(await p.locator('dialog[open]').count(),0);
  await act('[data-tab="fleet"]');assert.equal(await p.locator('[data-action="boat"]').count(),3);assert.equal(await p.locator('[data-rank-lock]').count(),3);assert.equal(await p.getAttribute('[data-tab="fleet"]','data-new'),'false');await shot('fleet-open');
  await act('[data-tab="yard"]');await p.locator('.ww-unlock-actions .ww-primary').focus();await p.evaluate(()=>{__widewake.game.s.stats.fish=12;__widewake.render();});assert.ok(await p.locator('#port-panel').evaluate(e=>e===document.activeElement),'a revealed shop must not put held confirm on a purchase');await act('[data-tab="yard"]');assert.equal(await p.getAttribute('#port-panel','data-locked'),'false');assert.equal(await p.locator('[data-action="upgrade"]').count(),4);assert.equal(await p.locator('[data-action="hull"][data-id="brig"]').count(),1);assert.ok(await p.locator('[data-action="hull"][data-id="brig"]').isDisabled(),'unlocking a yard does not waive a purchase cost');assert.equal(await p.locator('[data-rank-lock="leviathan"]').count(),1);
  // Existing accepted contracts remain deliverable, even below new thresholds.
  await p.evaluate(()=>{const g=__widewake.game,s=g.snapshot();s.xp=0;s.deliveries=[{id:'old-job',from:'nassau',to:'havana',good:'sugar',qty:6,reward:240}];__widewake.setState(s);});await act('[data-tab="jobs"]');assert.equal(await p.getAttribute('#port-panel','data-locked'),'false');await act('[data-action="deliver"][data-id="old-job"]');assert.ok(await p.evaluate(()=>__widewake.game.s.completedContracts.includes('old-job')));assert.equal(await p.evaluate(()=>__widewake.game.harborService('jobs').open),true);
  await p.evaluate(()=>__widewake.save());await p.reload();await p.waitForFunction(()=>window.__widewake);await act('#continue-voyage');assert.equal(await p.getAttribute('[data-tab="jobs"]','data-locked'),'false');await act('[data-tab="voyage"]');assert.equal(await p.locator('.ww-charter-index').getAttribute('open'),null);assert.equal(await p.locator('.ww-sea-reports').getAttribute('open'),null);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1));
  await context.close();console.log('PASS '+name+' visible locks, previews, next actions, repair, stale-action guard, focus, stock disclosure, legacy contract and reload');
 }
 assert.deepEqual(errors,[]);console.log('PASS no uncaught browser errors; artifacts '+out);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error);process.exitCode=1;});
