/* An automated captain using ordinary purchases, steering, guns, and repairs.
   No injected money, health, invulnerability, kills, or completed objectives. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../../js/widewake-data.js'),W=require('../../js/widewake-world.js'),C=require('../../js/widewake-core.js');
const earth=new W.Earth(JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/widewake/earth-land.geojson'))));
const seed=Number(process.env.WIDEWAKE_CAPTAIN_SEED||12345),style=process.env.WIDEWAKE_FLEET_STYLE||'balanced',reload=process.env.WIDEWAKE_CAPTAIN_RELOAD==='1';assert.ok(Number.isInteger(seed)&&seed>=0&&seed<=0xffffffff);assert.ok(['balanced','merchant','gunline'].includes(style));const state=C.fresh();state.seed=seed;let g=new C.Game(earth,state),ticks=0,savesChecked=0,portsChecked=0,maxSaveBytes=0;
function report(label){if(process.env.WIDEWAKE_CAPTAIN_OUTPUT){const folder=path.resolve(process.env.WIDEWAKE_CAPTAIN_OUTPUT);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,label.replace(/[^a-z0-9]+/gi,'-')+'.json'),JSON.stringify(g.snapshot()));}console.log(JSON.stringify({label,seed,style,savesChecked,portsChecked,maxSaveBytes,minutes:Math.round(g.s.seconds/60*10)/10,coins:g.s.coins,rank:g.rank,hull:g.s.hull,hp:Math.ceil(g.player.hp),fleet:g.fleet.map(f=>f.type),kills:g.s.stats.kills,charters:g.s.voyage.charters.length}));}
function tick(input={}){
  if(g.enemies.some(e=>e.hp>0&&W.distance(e,g.player)<450)&&g.enemies.length>=3)g.burst();
  if(g.player.hp<g.player.maxHp*.7||g.fleet.some(f=>f.hp<f.maxHp*.6)||g.encounter?.boat&&g.encounter.boat.hp<400)g.fieldRepair();
  g.step(1/60,input);ticks++;if(ticks%720===0){const saved=g.snapshot();C.validate(saved);savesChecked++;maxSaveBytes=Math.max(maxSaveBytes,JSON.stringify(saved).length);if(reload)g=new C.Game(earth,saved);}assert.equal(g.mode,'sea','the captain was towed home at '+Math.round(g.s.seconds)+'s');
}
function destination(id){return [...g.ports,...g.sites,...g.signals,...g.bossSites].find(p=>p.id===id);}
function sail(id){const to=typeof id==='string'?destination(id):id;assert.ok(g.navigate(to));for(let i=0;i<60*1600&&g.autopilot;i++)tick();if(g.autopilot)console.log(JSON.stringify({stuck:g.player,target:to,route:g.route}));assert.ok(!g.autopilot,'route did not finish: '+to.name);assert.ok(W.distance(g.player,to)<190,'missed '+to.name);}
function dock(id){if(g.mode==='port'){const exportGood=D.ports.find(p=>p.id===g.s.port).cheap,current=g.market(g.s.port,exportGood),future=g.market(id,exportGood);if(future.sell>current.buy*1.25)g.trade(exportGood,Math.min(style==='merchant'?160:80,Math.floor(g.s.coins*(style==='merchant'?.45:.35)/current.buy)));}sail(id);arrive();for(const item of D.goods)if(g.quantity(item.id))g.trade(item.id,99999,false);assert.ok(g.repair());const saved=g.snapshot();C.validate(saved);portsChecked++;if(reload)g=new C.Game(earth,saved);}
function arrive(){for(let i=0;i<120*60&&g.harborStragglers().length;i++)tick();assert.equal(g.harborStragglers().length,0,'a companion failed to sail into the harbor approach');assert.ok(g.fleet.every(f=>W.distance(f,g.nearestPort().port)<=C.HARBOR_APPROACH),'every surviving boat must physically arrive');assert.ok(g.dock());}
function orbit(center,seconds,predicate=()=>true,radius=185){for(let i=0;i<seconds*60&&predicate();i++){const a=g.s.seconds*.32,tx=W.wrap(center.x+Math.cos(a)*radius),ty=center.y+Math.sin(a)*radius,dx=W.dx(g.player.x,tx),dy=ty-g.player.y,d=Math.max(1,Math.hypot(dx,dy));tick({x:dx/d,y:dy/d});}}
function work(id){sail(id);assert.ok(g.startProduction());orbit(destination(id),g.production.plan.duration+45,()=>!!g.production);assert.equal(g.production,null);if(!g.s.voyage.worked[id]){report('failed operation '+id);console.log(JSON.stringify({events:g.events,journal:g.s.journal.slice(-7),cargo:g.cargoShips(),production:g.production}));}assert.ok(g.s.voyage.worked[id]>0,'operation not completed: '+id);}
function story(id){sail(id);assert.ok(g.signalChoice(id,'work'));orbit(destination(id),180,()=>!!g.encounter,220);assert.ok(g.s.voyage.resolved[id],'story failed: '+id);}
function fight(id){
  sail(id);for(let i=0;i<300*60&&!g.s.bosses.includes(id);i++){
    const boss=g.enemies.find(e=>e.bossId===id);assert.ok(boss,'admiral disappeared');
    const angle=g.s.seconds*.24,r=355,tx=W.wrap(boss.x+Math.cos(angle)*r),ty=boss.y+Math.sin(angle)*r,dx=W.dx(g.player.x,tx),dy=ty-g.player.y,d=Math.max(1,Math.hypot(dx,dy));tick({x:dx/d,y:dy/d});
  }assert.ok(g.s.bosses.includes(id),'admiral fight exceeded five minutes');report('defeated '+id);
}
function fit(){for(const id of ['heart','plate','shell','brass'])if(g.s.items.includes(id)&&!g.s.equipped.includes(id)&&g.s.equipped.length<3)g.equip(id);}
function equipFleet(){
  fit();if(style==='merchant'&&!g.fleet.some(f=>f.type==='freighter')&&g.s.coins>6500)g.buyBoat('freighter');if(style==='gunline'&&g.rank>=5&&g.fleet.filter(f=>f.type==='repair').length<2&&g.s.coins>6500)g.buyBoat('repair');for(const type of ['corvette','frigate','leviathan'])if(g.rank>=D.hulls.find(h=>h.id===type).rank&&g.s.coins>D.hulls.find(h=>h.id===type).cost+3500)g.buyHull(type);
  if(!g.fleet.some(f=>f.type==='repair')&&g.rank>=3&&g.s.coins>4500)g.buyBoat('repair');
  for(const upgrade of ['guns','hull','engine'])while(g.s.upgrades[upgrade]<Math.min(4,Math.floor(g.rank/2))&&g.s.coins>g.upgradeCost(upgrade)+1500)g.upgrade(upgrade);
  while(g.fleet.filter(f=>g.canGuard(f)&&f.type!=='repair').length<Math.min(style==='gunline'?14:6,g.rank*(style==='gunline'?2:1))&&g.s.coins>5000&&g.fleet.length<g.fleetLimit)g.buyBoat(style==='gunline'?'escort':g.rank>=4?'destroyer':'escort');
}
g.trade('sugar',10);dock('nassau');g.buyBoat('trawler');work('bahama-bank');dock('nassau');assert.ok(g.buyHull('brig'));assert.ok(g.claimCharter());g.buyBoat('escort');g.upgrade('guns');g.upgrade('hull');fit();report('first charter earned');
story('calypso');dock('nassau');fit();fight('widow');dock('lisbon');assert.ok(g.claimCharter());equipFleet();report('Atlantic charter earned');
dock('bergen');equipFleet();g.trade('wood',18);work('iceland-bank');sail('reykjavik');arrive();assert.ok(g.charterDelivery('north-timber'));assert.ok(g.claimCharter());for(const item of D.goods)g.trade(item.id,99999,false);g.repair();assert.ok(g.buyBoat('oilrig'));equipFleet();report('northern charter earned');
work('north-sea');dock('lisbon');equipFleet();dock('cape-town');equipFleet();dock('mombasa');equipFleet();fight('iron-king');dock('mombasa');assert.ok(g.claimCharter());equipFleet();report('Cape charter earned');
dock('singapore');equipFleet();dock('yokohama');equipFleet();if(!g.fleet.some(f=>f.type==='trawler'))g.buyBoat('trawler');work('japan-trench');dock('yokohama');equipFleet();assert.ok(g.claimCharter());report('eastern charter earned');
dock('auckland');equipFleet();story('silent-station');fight('last-light');dock('honolulu');equipFleet();dock('havana');assert.ok(g.claimCharter());assert.equal(g.charter(),null);report('home, campaign complete');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
assert.ok(ticks>100000);assert.equal(new C.Game(earth,g.snapshot()).s.voyage.charters.length,6);console.log(JSON.stringify({reload,finalHash:require('node:crypto').createHash('sha256').update(JSON.stringify(canonical(C.validate(g.snapshot())))).digest('hex')}));console.log('PASS complete earned campaign, persistent ending, and ordinary combat');
