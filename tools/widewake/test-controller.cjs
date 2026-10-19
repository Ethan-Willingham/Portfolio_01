/* Standard-layout input through the actual browser shell, not direct action calls. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium,webkit}=require('playwright'),{stick}=require('../../js/widewake-controller.js'),C=require('../../js/widewake-core.js');
assert.deepEqual(stick(.1,-.1),{x:0,y:0});assert.deepEqual(stick(NaN,Infinity),{x:0,y:0});assert.equal(stick(1,0).x,1);assert.ok(Math.abs(Math.hypot(...Object.values(stick(1,1)))-1)<1e-10);assert.ok(stick(.3,0).x<stick(.6,0).x);assert.ok(Number.isFinite(stick(.5,0,1).x));
const old=C.fresh();delete old.settings.controllerDeadzone;delete old.settings.controllerLabels;delete old.settings.controllerRumble;assert.equal(C.validate(old).settings.controllerDeadzone,.18);old.settings.controllerDeadzone=20;old.settings.controllerLabels='<script>';old.settings.controllerRumble='yes';const cleaned=C.validate(old).settings;assert.equal(cleaned.controllerDeadzone,.35);assert.equal(cleaned.controllerLabels,'auto');assert.equal(cleaned.controllerRumble,true);
const root=path.resolve(__dirname,'../..'),out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-controller-checks');fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.geojson':'application/json','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'}).end(data);});});
let browser;const errors=[],check=message=>console.log('PASS '+message);
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=process.env.WIDEWAKE_TEST_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'/Users/ethan/.local/bin/agent-chrome-for-testing',args:['--autoplay-policy=document-user-activation-required']});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addInitScript(()=>{
   window.testPad={id:'Xbox standard test pad',index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0})),vibrationActuator:{reset(){window.rumbleResets++;return Promise.resolve();},playEffect(type,options){window.rumbles.push({type,options});return Promise.resolve('complete');}}};
   window.rumbles=[];window.rumbleResets=0;window.padAccess=true;
   Object.defineProperty(navigator,'getGamepads',{value:()=>{if(window.padAccess==='error')throw new Error('blocked');return window.padAccess?[window.testPad]:[];},configurable:true});
 });
 const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/widewake.html?test');await p.waitForFunction(()=>window.__widewake?.controller?.present);await p.evaluate(()=>document.fonts.ready);
 const poll=async()=>{const before=await p.evaluate(()=>__widewake.controller.polls);await p.waitForFunction(n=>__widewake.controller.polls>n+2,before);};
 async function set(buttons=[],axes=[0,0,0,0]){await p.evaluate(({buttons,axes})=>{testPad.axes=axes;testPad.buttons.forEach((b,i)=>{b.pressed=buttons.includes(i);b.value=b.pressed?1:0;});},{buttons,axes});await poll();}
 async function tap(button){await set([button]);await set();}
 async function selected(selector){return p.evaluate(s=>document.activeElement?.matches(s),selector);}
 async function reach(selector,{port=false,limit=100}={}){
   for(let i=0;i<limit;i++){if(await selected(selector))return;if(port)await tap(13);else await tap(5);}
   throw new Error('Could not reach '+selector+'; state '+JSON.stringify(await p.evaluate(()=>({focus:document.activeElement.outerHTML,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>d.id),plot:document.getElementById('plot-course').outerHTML,mode:__widewake.game.mode,editing:__widewake.controller.editing,blocked:__widewake.controller.blocked,context:__widewake.controller.options.context().scope.id,buttons:__widewake.controller.buttons(__widewake.controller.options.context().scope).map(b=>b.id||b.textContent.slice(0,30))}))));
 }
 async function choose(selector,options){await reach(selector,options);await tap(0);}
 // No mouse or key event has unlocked the page in this context.
 await tap(13);assert.ok(await selected('#title-settings'));await tap(0);assert.ok(await p.locator('#settings-dialog').isVisible());
 await reach('#volume');await tap(0);const volume=await p.inputValue('#volume');await tap(15);assert.ok(Number(await p.inputValue('#volume'))>Number(volume));await tap(1);assert.equal(await p.inputValue('#volume'),volume);assert.ok(await p.locator('#settings-dialog').isVisible());
 await reach('.ww-controller-settings summary');await tap(0);await reach('#controller-deadzone');await tap(0);await tap(12);assert.equal(await p.inputValue('#controller-deadzone'),'0.19');await tap(0);
 await reach('#controller-labels');await tap(0);await tap(13);await tap(13);await tap(0);assert.match(await p.locator('.ww-pad-help').first().innerText(),/Cross/);await tap(1);
 assert.equal(await p.evaluate(()=>localStorage.getItem('widewake-save-v2')),null);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('widewake-preferences-v1')).controllerDeadzone),.19);
 await p.screenshot({path:path.join(out,'title-controller.png')});
 check('radial analog input, validated settings, pad-only title, editable sliders, undo and button labels');
 // Starting a fresh voyage while holding A may open one screen only.
 await reach('#start-voyage');await set([0]);await p.waitForTimeout(500);assert.ok(await p.locator('#departure-dialog').isVisible());assert.equal(await p.locator('#chart-dialog').isVisible(),false);await set();await tap(1);
 assert.ok(await p.locator('#harbor').isVisible());await tap(5);assert.equal(await p.getAttribute('#port-panel','data-service'),'fleet');await tap(4);assert.equal(await p.getAttribute('#port-panel','data-service'),'trade');
 // From the selected Trade tab, the d-pad enters the rows, preserving focus after purchase.
 await tap(13);assert.ok(await selected('[data-action="select-good"][data-id="sugar"]'));await tap(0);assert.ok(await selected('[data-action="buy"][data-id="sugar"]'));const sugar=await p.evaluate(()=>__widewake.game.quantity('sugar'));await tap(0);assert.equal(await p.evaluate(()=>__widewake.game.quantity('sugar')),sugar+5);assert.ok(await selected('[data-action="buy"][data-id="sugar"]'));
 await p.screenshot({path:path.join(out,'market-controller.png')});
 await tap(9);assert.ok(await p.locator('#settings-dialog').isVisible());await reach('#settings-handbook');await tap(0);assert.ok(await p.locator('#handbook-dialog').isVisible());await tap(1);assert.ok(await p.locator('#settings-dialog').isVisible());assert.equal(await p.evaluate(()=>__widewake.game.paused),true);await tap(1);
 // Reach the chart through the harbor, then select from the same accessible destination list.
 assert.ok(await selected('[data-action="buy"][data-id="sugar"]'));await tap(1);assert.equal(await p.locator('#port-panel').isVisible(),false);await tap(13);assert.ok(await selected('#cast-off'));await tap(15);assert.ok(await selected('#harbor-chart'));await tap(0);await reach('#destination-list');await tap(0);const destination=await p.inputValue('#destination-list');await tap(13);assert.notEqual(await p.inputValue('#destination-list'),destination);await tap(1);assert.equal(await p.inputValue('#destination-list'),destination);
 await p.waitForFunction(()=>!document.getElementById('plot-course').disabled);await reach('#plot-course');await tap(0);assert.equal(await p.evaluate(()=>__widewake.game.mode),'sea');assert.equal(await p.evaluate(()=>__widewake.game.autopilot),true);
 check('pad-only new voyage, held-confirm gate, market purchase, nested help and plotted departure');
 await set([],[0,0,.9,0]);await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>__widewake.input.fire),true);assert.ok(await p.evaluate(()=>WidewakeWorld.dx(__widewake.game.player.x,__widewake.input.aim.x)>100));assert.ok(await p.evaluate(()=>rumbles.some(p=>p.type==='dual-rumble')));await set();assert.equal(await p.evaluate(()=>__widewake.input.fire),false);
 await set([6],[.8,0,0,0]);assert.equal(await p.evaluate(()=>__widewake.game.autopilot),false);assert.equal(await p.evaluate(()=>__widewake.input.boost),true);assert.ok(await p.evaluate(()=>__widewake.game.target));await set();
 await tap(2);assert.ok(await p.evaluate(()=>__widewake.game.burstCD>0));const formation=await p.evaluate(()=>__widewake.game.formation);await tap(15);assert.notEqual(await p.evaluate(()=>__widewake.game.formation),formation);await tap(14);assert.equal(await p.evaluate(()=>__widewake.game.formation),formation);
 const zoom=await p.evaluate(()=>__widewake.renderer.zoom);await tap(12);assert.ok(await p.evaluate(z=>__widewake.renderer.zoom>z,zoom));await tap(13);
 await p.screenshot({path:path.join(out,'sailing-controller.png')});
 await tap(5);await reach('[data-convoy-action="select"][data-uid="1"]');await tap(0);await reach('#convoy-guard');await tap(0);await tap(13);await tap(0);assert.equal(await p.evaluate(()=>__widewake.game.s.fleet[0].guardUid),0);await tap(1);
 check('manual aim, shooting, steam, autopilot override, broadside, zoom, formation and saved guard orders');
 // Losing input freezes the sea. Reconnecting while holding fire cannot resume it.
 await set([7],[.8,0,1,0]);await p.evaluate(()=>{testPad.connected=false;});await poll();assert.ok(await p.locator('#settings-dialog').isVisible());assert.equal(await p.evaluate(()=>__widewake.input.fire),false);assert.ok(await p.evaluate(()=>rumbleResets>0));
 const seconds=await p.evaluate(()=>__widewake.game.s.seconds);await p.evaluate(()=>{testPad.connected=true;testPad.buttons[9]={pressed:true,value:1};});await poll();await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>__widewake.game.s.seconds),seconds);assert.ok(await p.locator('#settings-dialog').isVisible());await set();await tap(9);assert.equal(await p.evaluate(()=>__widewake.game.paused),false);assert.equal(await p.evaluate(()=>__widewake.input.fire),false);
 await set([7],[.9,0,1,0]);await p.evaluate(()=>window.dispatchEvent(new Event('blur')));const polls=await p.evaluate(()=>__widewake.controller.polls);await p.waitForTimeout(180);assert.equal(await p.evaluate(()=>__widewake.controller.polls),polls);assert.equal(await p.evaluate(()=>__widewake.input.fire),false);await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await poll();assert.ok(await p.locator('#settings-dialog').isVisible());await set();await tap(1);
 await p.evaluate(()=>{padAccess='error';});await poll();assert.ok(await p.locator('#settings-dialog').isVisible());await p.evaluate(()=>{padAccess=true;testPad.mapping='';});await poll();assert.match(await p.locator('#controller-status').textContent(),/no standard layout/);await tap(0);assert.ok(await p.locator('#settings-dialog').isVisible());await p.evaluate(()=>{testPad.mapping='standard';});await poll();await set();await tap(1);
 check('disconnect, reconnect with held controls, stopped background polling and unavailable/unknown devices');
 // Continue the earned voyage. Advance ordinary fixed steps, with no money or hull grants.
 await tap(4);await p.waitForFunction(()=>!document.getElementById('plot-course').disabled);await reach('#plot-course');await tap(0);
 await p.evaluate(()=>{const g=__widewake.game;for(let i=0;i<180*60;i++){if(g.ports.find(p=>p.id==='nassau')&&WidewakeWorld.distance(g.player,g.ports.find(p=>p.id==='nassau'))<170)break;g.step(1/60,{});}__widewake.render();});
 assert.ok(await p.evaluate(()=>WidewakeWorld.distance(__widewake.game.player,__widewake.game.ports.find(p=>p.id==='nassau'))<190));await tap(0);assert.equal(await p.evaluate(()=>__widewake.game.s.port),'nassau');
 await tap(5);await tap(4);await tap(13);await tap(0);await tap(15);assert.ok(await selected('[data-action="sell"][data-id="sugar"]'));await tap(0);await tap(0);assert.ok(await p.evaluate(()=>__widewake.game.s.stats.sugar>=6));
 await tap(5);await reach('[data-action="boat"][data-id="trawler"]',{port:true,limit:15});await tap(0);assert.ok(await p.evaluate(()=>__widewake.game.s.fleet.some(f=>f.type==='trawler')));
 check('ordinary plotted voyage reaches Nassau, controller docks, sells real cargo and buys a workboat');
 await tap(5);await tap(5);await reach('[data-action="voyage-route"][data-id="bahama-bank"]',{port:true,limit:12});assert.ok(await selected('[data-action="voyage-route"][data-id="bahama-bank"]'));await tap(0);await p.waitForFunction(()=>!document.getElementById('plot-course').disabled);await reach('#plot-course');await tap(0);
 await tap(5);await reach('[data-convoy-action="select"][data-uid="1"]');await tap(0);await reach('#convoy-guard');await tap(0);await tap(13);await tap(0);assert.equal(await p.evaluate(()=>__widewake.game.s.fleet[0].guardUid),2);await tap(1);
 await p.evaluate(()=>{const g=__widewake.game,site=g.sites.find(s=>s.id==='bahama-bank');for(let i=0;i<180*60&&WidewakeWorld.distance(g.player,site)>120;i++)g.step(1/60,{});__widewake.render();});await tap(0);assert.ok(await p.locator('#work-dialog').evaluate(d=>d.open));await reach('[data-action="work-start"][data-watches="1"]');await tap(0);assert.equal(await p.evaluate(()=>__widewake.game.production?.site.id),'bahama-bank');await p.screenshot({path:path.join(out,'protecting-trawler-controller.png')});
 for(let i=0;i<25;i++){if(!await p.evaluate(()=>!!__widewake.game.production))break;await tap(2);if(await p.evaluate(()=>__widewake.game.player.hp<120||__widewake.game.fleet.some(f=>f.hp<f.maxHp*.5)))await tap(3);await p.evaluate(()=>__widewake.step(4));}
 assert.ok(await p.evaluate(()=>__widewake.game.s.stats.operations>0&&__widewake.game.s.stats.fish>=12));assert.ok(await p.evaluate(()=>__widewake.game.s.fleet.find(f=>f.type==='trawler').cargo.fish>=12));
 await tap(4);assert.equal(await p.inputValue('#destination-list'),'nassau');await p.waitForFunction(()=>!document.getElementById('plot-course').disabled);await reach('#plot-course');await tap(0);
 await p.evaluate(()=>{const g=__widewake.game,port=g.ports.find(p=>p.id==='nassau');for(let i=0;i<180*60&&WidewakeWorld.distance(g.player,port)>160;i++)g.step(1/60,{});__widewake.render();});await tap(0);assert.equal(await p.evaluate(()=>__widewake.game.mode),'port');assert.equal(await p.evaluate(()=>__widewake.game.s.port),'nassau');
 check('charter guidance, a named workboat guard, automatic fishing with combat and an earned return to port');

 // Buy a real cargo hold for the next trading run. A damaged escort may have
 // been lost on the return trip; a full reserved trawler cannot take sugar.
 await reach('[data-tab="fleet"]');await tap(0);await reach('[data-action="boat"][data-id="freighter"]',{port:true,limit:40});await tap(0);const cargoUid=await p.evaluate(()=>__widewake.game.fleet.find(f=>f.type==='freighter')?.uid);assert.ok(cargoUid);
 // Emptying a manifest must leave a useful focus target after its transfer row disappears.
 await p.keyboard.press('c');await choose('[data-convoy-action="select"][data-uid="0"]');await reach('#convoy-to');await tap(0);for(let i=0;i<24&&await p.inputValue('#convoy-to')!==String(cargoUid);i++)await tap(13);await tap(0);assert.equal(await p.inputValue('#convoy-to'),String(cargoUid));await reach('#convoy-quantity');await tap(0);await tap(13);await tap(13);await tap(0);await reach('[data-convoy-action="move"][data-good="sugar"]');await tap(0);assert.ok(await selected('[data-convoy-action="select"][data-uid="0"]'));assert.equal(await p.locator('[data-convoy-action="move"][data-good="sugar"]').count(),0);await tap(1);
 check('emptying a cargo row keeps focus on the selected vessel');
 await p.keyboard.press('c');const repair=await p.evaluate(()=>({coins:__widewake.game.s.coins,cost:__widewake.game.repairCost()}));await reach('[data-convoy-action="repair"]');await tap(0);assert.equal(await p.evaluate(()=>__widewake.game.s.coins),repair.coins-repair.cost);assert.equal(await p.evaluate(()=>__widewake.game.needsRepair()),false);await tap(1);check('controller repairs the damaged fleet from its convoy desk at port');
 await tap(9);await reach('#return-title');await tap(0);assert.ok(await p.locator('#title-screen').isVisible());await reach('#continue-voyage');await tap(0);assert.equal(await p.evaluate(()=>__widewake.game.mode),'port');await tap(9);
 // Real mouse/key control must replace prompts and unlock browser-gated audio.
 await p.click('#sound-enabled');await p.check('#sound-enabled');await p.waitForFunction(()=>__widewake.sound?.ctx.state==='running');assert.equal(await p.evaluate(()=>document.body.classList.contains('using-controller')),false);await tap(5);assert.equal(await p.evaluate(()=>document.body.classList.contains('using-controller')),true);
 await p.locator('#volume').focus();await p.keyboard.press('Home');await p.uncheck('#sound-enabled');assert.equal(await p.evaluate(()=>__widewake.game.s.settings.sound),false);await p.check('#sound-enabled');assert.equal(await p.evaluate(()=>__widewake.game.s.settings.sound),true);await tap(5);
 for(const [name,width,height] of [['portrait',360,640],['landscape',667,375]]){await p.setViewportSize({width,height});await poll();await reach('#controller-labels');await p.screenshot({path:path.join(out,name+'-controller-settings.png')});const rect=await p.locator('#controller-labels').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width&&rect.y>=0&&rect.y+rect.height<=height);assert.ok(rect.height>=44);}
 check('saved title round trip, mouse handoff, audible unlock and controller focus at phone sizes');
 // A page-owned input sequence avoids Playwright's evaluation user gesture and checks a cold browser.
 await context.close();const coldContext=await browser.newContext({viewport:{width:900,height:700}});
 await coldContext.addInitScript(()=>{
   const pad={id:'Cold standard pad',index:0,mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});
   const ready=setInterval(()=>{if(!window.__widewake?.controller||__widewake.controller.blocked)return;clearInterval(ready);pad.axes[1]=.8;setTimeout(()=>{pad.axes[1]=0;setTimeout(()=>{window.coldResult={active:navigator.userActivation?.hasBeenActive,state:__widewake.sound?.ctx.state,notice:!document.querySelector('.ww-audio-notice').hidden};document.body.dataset.coldReady='yes';},300);},100);},50);
 });
 const cold=await coldContext.newPage();cold.on('pageerror',e=>errors.push(e.message));await cold.goto(base+'/widewake.html?test');await cold.waitForTimeout(1800);const coldResult=await cold.evaluate(()=>coldResult);assert.equal(coldResult.active,false);
 console.log('Cold audio',JSON.stringify(coldResult));if(process.env.WIDEWAKE_TEST_ENGINE!=='webkit')assert.equal(coldResult.state,'suspended');
 if(['suspended','interrupted'].includes(coldResult.state)){assert.equal(coldResult.notice,true);await cold.click('#title-screen .ww-audio-notice');await cold.waitForFunction(()=>__widewake.sound.ctx.state==='running');assert.equal(await cold.evaluate(()=>__widewake.game.s.settings.sound),true);}
 assert.equal(await cold.evaluate(()=>localStorage.getItem('widewake-save-v2')),null);await coldContext.close();check('cold controller input respects browser audio policy and offers a real click to enable sound');
 assert.deepEqual(errors,[]);console.log('Controller browser checks complete. Screenshots: '+out);
}finally{await browser?.close();await new Promise(r=>server.close(r));}})().catch(err=>{console.error(err);process.exitCode=1;});
