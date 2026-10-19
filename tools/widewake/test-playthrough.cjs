/* An automated captain using ordinary purchases, steering, guns, and repairs.
   No injected money, health, invulnerability, kills, or completed objectives. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../../js/widewake-data.js'),W=require('../../js/widewake-world.js'),C=require('../../js/widewake-core.js');
const earth=new W.Earth(JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/widewake/earth-land.geojson'))));
const state=C.fresh();state.seed=12345;const g=new C.Game(earth,state);let ticks=0;
function report(label){console.log(JSON.stringify({label,minutes:Math.round(g.s.seconds/60*10)/10,coins:g.s.coins,rank:g.rank,hull:g.s.hull,hp:Math.ceil(g.player.hp),fleet:g.fleet.map(f=>f.type),kills:g.s.stats.kills,charters:g.s.voyage.charters.length}));}
function tick(input={}){
  if(g.enemies.some(e=>e.hp>0&&W.distance(e,g.player)<450)&&g.enemies.length>=3)g.burst();
  if(g.player.hp<g.player.maxHp*.7||g.fleet.some(f=>f.hp<f.maxHp*.6)||g.encounter?.boat&&g.encounter.boat.hp<400)g.fieldRepair();
  g.step(1/60,input);ticks++;assert.equal(g.mode,'sea','the captain was towed home at '+Math.round(g.s.seconds)+'s');
}
function destination(id){return [...g.ports,...g.sites,...g.signals,...g.bossSites].find(p=>p.id===id);}
function sail(id){const to=typeof id==='string'?destination(id):id;assert.ok(g.navigate(to));for(let i=0;i<60*1600&&g.autopilot;i++)tick();if(g.autopilot)console.log(JSON.stringify({stuck:g.player,target:to,route:g.route}));assert.ok(!g.autopilot,'route did not finish: '+to.name);assert.ok(W.distance(g.player,to)<190,'missed '+to.name);}
function dock(id){if(g.mode==='port'){const exportGood=D.ports.find(p=>p.id===g.s.port).cheap,current=g.market(g.s.port,exportGood),future=g.market(id,exportGood);if(future.sell>current.buy*1.25)g.trade(exportGood,Math.min(80,Math.floor(g.s.coins*.35/current.buy)));}sail(id);assert.ok(g.dock());for(const item of D.goods)if(g.quantity(item.id))g.trade(item.id,99999,false);assert.ok(g.repair());}
function orbit(center,seconds,predicate=()=>true,radius=185){for(let i=0;i<seconds*60&&predicate();i++){const a=g.s.seconds*.32,tx=W.wrap(center.x+Math.cos(a)*radius),ty=center.y+Math.sin(a)*radius,dx=W.dx(g.player.x,tx),dy=ty-g.player.y,d=Math.max(1,Math.hypot(dx,dy));tick({x:dx/d,y:dy/d});}}
function work(id){sail(id);assert.ok(g.startProduction());orbit(destination(id),75,()=>!!g.production);assert.equal(g.production,null);if(!g.s.voyage.worked[id]){report('failed operation '+id);console.log(JSON.stringify({events:g.events,journal:g.s.journal.slice(-7),cargo:g.cargoShips(),production:g.production}));}assert.ok(g.s.voyage.worked[id]>0,'operation not completed: '+id);}
function story(id){sail(id);assert.ok(g.signalChoice(id,'work'));orbit(destination(id),180,()=>!!g.encounter,220);assert.ok(g.s.voyage.resolved[id],'story failed: '+id);}
function fight(id){
  sail(id);for(let i=0;i<300*60&&!g.s.bosses.includes(id);i++){
    const boss=g.enemies.find(e=>e.bossId===id);assert.ok(boss,'admiral disappeared');
    const angle=g.s.seconds*.24,r=355,tx=W.wrap(boss.x+Math.cos(angle)*r),ty=boss.y+Math.sin(angle)*r,dx=W.dx(g.player.x,tx),dy=ty-g.player.y,d=Math.max(1,Math.hypot(dx,dy));tick({x:dx/d,y:dy/d});
  }assert.ok(g.s.bosses.includes(id),'admiral fight exceeded five minutes');report('defeated '+id);
}
function fit(){for(const id of ['heart','plate','shell','brass'])if(g.s.items.includes(id)&&!g.s.equipped.includes(id)&&g.s.equipped.length<3)g.equip(id);}
function equipFleet(){
  fit();for(const type of ['corvette','frigate','leviathan'])if(g.rank>=D.hulls.find(h=>h.id===type).rank&&g.s.coins>D.hulls.find(h=>h.id===type).cost+3500)g.buyHull(type);
  if(!g.fleet.some(f=>f.type==='repair')&&g.rank>=3&&g.s.coins>4500)g.buyBoat('repair');
  for(const upgrade of ['guns','hull','engine'])while(g.s.upgrades[upgrade]<Math.min(4,Math.floor(g.rank/2))&&g.s.coins>g.upgradeCost(upgrade)+1500)g.upgrade(upgrade);
  while(g.fleet.filter(f=>g.canGuard(f)&&f.type!=='repair').length<Math.min(6,g.rank)&&g.s.coins>5000&&g.fleet.length<g.fleetLimit)g.buyBoat(g.rank>=4?'destroyer':'escort');
}
g.trade('sugar',10);dock('nassau');g.buyBoat('trawler');work('bahama-bank');dock('nassau');assert.ok(g.buyHull('brig'));assert.ok(g.claimCharter());g.buyBoat('escort');g.upgrade('guns');g.upgrade('hull');fit();report('first charter earned');
story('calypso');dock('nassau');fit();fight('widow');dock('lisbon');assert.ok(g.claimCharter());equipFleet();report('Atlantic charter earned');
dock('bergen');equipFleet();g.trade('wood',18);work('iceland-bank');sail('reykjavik');g.dock();assert.ok(g.charterDelivery('north-timber'));assert.ok(g.claimCharter());for(const item of D.goods)g.trade(item.id,99999,false);g.repair();assert.ok(g.buyBoat('oilrig'));equipFleet();report('northern charter earned');
work('north-sea');dock('lisbon');equipFleet();dock('cape-town');equipFleet();dock('mombasa');equipFleet();fight('iron-king');dock('mombasa');assert.ok(g.claimCharter());equipFleet();report('Cape charter earned');
dock('singapore');equipFleet();dock('yokohama');equipFleet();if(!g.fleet.some(f=>f.type==='trawler'))g.buyBoat('trawler');work('japan-trench');dock('yokohama');equipFleet();assert.ok(g.claimCharter());report('eastern charter earned');
dock('auckland');equipFleet();story('silent-station');fight('last-light');dock('honolulu');equipFleet();dock('havana');assert.ok(g.claimCharter());assert.equal(g.charter(),null);report('home, campaign complete');
assert.ok(ticks>100000);assert.equal(new C.Game(earth,g.snapshot()).s.voyage.charters.length,6);console.log('PASS complete earned campaign, persistent ending, and ordinary combat');
