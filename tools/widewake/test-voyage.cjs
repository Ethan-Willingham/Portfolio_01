const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const D=require('../../js/widewake-data.js'),W=require('../../js/widewake-world.js'),C=require('../../js/widewake-core.js');
const earth=new W.Earth(JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/widewake/earth-land.geojson'))));
const make=()=>{const s=C.fresh();s.seed=12345;return new C.Game(earth,s);};
const step=(g,seconds,input={})=>{for(let i=0;i<seconds*60;i++)g.step(1/60,input);};
const check=(name,fn)=>{fn();console.log('PASS '+name);};
function moveTo(g,p){g.sail();Object.assign(g.player,{x:p.x,y:p.y,vx:0,vy:0});g.wake=[{x:p.x,y:p.y}];for(const f of g.fleet){f.x=p.x-60;f.y=p.y+40;f.wake=[{x:f.x,y:f.y}];}g.spawnTimer=1e6;}
check('repacking conserves every coin and unit, respects capacity, and permits retirement',()=>{
  const g=make(),coins=g.s.coins;assert.equal(g.transferCargo(0,1,'sugar',20),12);assert.equal(g.s.coins,coins);assert.equal(g.quantity('sugar'),12);assert.equal(g.s.cargo.sugar,0);assert.equal(g.sellBoat(1),false);
  assert.equal(g.transferCargo(1,0,'sugar',9999),12);assert.equal(g.sellBoat(1),true);assert.equal(g.quantity('sugar'),12);
  const before=JSON.stringify(g.snapshot());for(const n of [NaN,Infinity,0,-5])assert.equal(g.transferCargo(0,1,'sugar',n),0);assert.equal(JSON.stringify(g.snapshot()),before);
});
check('reserved workboat holds stay available while traders fill the cargo lighter first',()=>{
  const g=make();g.s.coins=10000;g.buyBoat('trawler');g.buyBoat('freighter');const worker=g.s.fleet.find(f=>f.type==='trawler'),lighter=g.s.fleet.find(f=>f.type==='freighter');
  assert.equal(g.transferCargo(0,worker.uid,'sugar',5),0);g.addCargo('iron',130);assert.equal(lighter.cargo.iron,110);assert.equal(worker.cargo.iron,undefined);assert.equal(g.cargoSpace('iron'),g.capacity()-g.used()-60);
  assert.ok(g.reserveHold(worker.uid,false));assert.equal(g.transferCargo(0,worker.uid,'sugar',5),5);assert.ok(g.reserveHold(worker.uid,true));assert.equal(worker.cargo.sugar,5);assert.equal(g.addCargo('fish',10,worker.uid),10);assert.equal(worker.cargo.fish,10);
  g.sail();assert.equal(g.transferCargo(worker.uid,0,'fish',1),0);assert.equal(g.reserveHold(worker.uid,false),false);
});
check('automatic escorts protect workers while the flagship maneuvers, then rejoin',()=>{
  const g=make();g.s.coins=8000;g.buyBoat('trawler');g.buyBoat('trawler');g.buyBoat('escort');moveTo(g,g.sites[0]);g.startProduction();g.spawnTimer=1e6;step(g,3);
  const guards=g.fleet.filter(f=>g.canGuard(f)),workers=g.production.workers;assert.notEqual(g.guardAnchor(guards[0]),g.guardAnchor(guards[1]));g.player.x+=650;step(g,8);
  for(const f of guards)assert.ok(W.distance(f,g.guardAnchor(f))<155);assert.ok(W.distance(guards[0],g.player)>400);
  g.finishProduction(false);for(const f of guards)assert.equal(g.guardAnchor(f),g.player);assert.equal(workers.length,2);
});
check('named guards survive save and release safely after their charge sinks',()=>{
  const g=make();g.s.coins=2000;g.buyBoat('freighter');const cargo=g.fleet.find(f=>f.type==='freighter');assert.ok(g.setGuard(1,cargo.uid));assert.equal(g.setGuard(cargo.uid,1),false);assert.equal(g.setGuard(1,1),false);
  g.sail();const resumed=new C.Game(earth,g.snapshot());assert.equal(resumed.fleet[0].data.guardUid,cargo.uid);resumed.hurt(resumed.fleet.find(f=>f.uid===cargo.uid),10000);assert.equal(resumed.fleet[0].data.guardUid,null);assert.doesNotThrow(()=>new C.Game(earth,resumed.snapshot()));
});
check('sea saves retain course, boat positions, formation, wake, and action cooldowns',()=>{
  const g=make();g.navigate(g.ports.find(p=>p.id==='nassau'));step(g,6);g.formation='wide';g.burst();g.player.hp-=40;g.fieldRepair();const s=g.snapshot(),resumed=new C.Game(earth,s);
  assert.ok(resumed.autopilot);assert.equal(resumed.target.id,'nassau');assert.deepEqual(resumed.route,g.route.map(({x,y})=>({x,y})));assert.equal(resumed.formation,'wide');assert.equal(resumed.burstCD,9);assert.equal(resumed.repairCD,25);assert.ok(W.distance(resumed.fleet[0],g.fleet[0])<.001);assert.deepEqual(resumed.wake,g.wake);
  step(resumed,30);assert.ok(resumed.dock());const port=resumed.nearestPort().port;resumed.snapshot();resumed.sail();assert.ok(W.distance(resumed.player,port)<1);assert.ok(W.distance(resumed.fleet[0],port)<150);
});
check('original saves migrate and malformed new fields cannot replace a fleet',()=>{
  const s=make().snapshot();for(const k of ['course','formation','wake','voyage','cooldowns'])delete s[k];for(const f of s.fleet)for(const k of ['guardUid','reserve','location','wake'])delete f[k];assert.equal(new C.Game(earth,s).charter().id,'company');
  for(const change of [s=>s.fleet[0].guardUid=999,s=>s.fleet[0].reserve='yes',s=>s.formation='invisible',s=>s.course={route:[{x:NaN,y:0}],target:{x:4,y:4},autopilot:true},s=>s.voyage={charters:['home'],resolved:{},worked:{},deliveries:[]}]){const bad=make().snapshot();change(bad);assert.throws(()=>new C.Game(earth,bad));}
});
check('all sea stories have water-only approaches',()=>{
  const g=make();for(const s of g.signals){assert.ok(earth.water(s.x,s.y,30),s.id);const route=earth.route(g.player,s);assert.ok(route,s.id);for(let i=1;i<route.length;i++)assert.ok(earth.clear(route[i-1],route[i],15),s.id);}
});
check('wreck recovery takes actual protected time and cannot pay twice',()=>{
  const g=make(),s=g.signals.find(s=>s.id==='calypso');moveTo(g,s);assert.ok(g.signalChoice(s.id,'work'));assert.equal(g.signalChoice(s.id,'cargo'),false);assert.equal(g.s.voyage.resolved[s.id],undefined);g.enemies=[];g.encounter.wave=1e6;g.spawnTimer=1e6;step(g,20);assert.ok(g.encounter);const resumed=new C.Game(earth,g.snapshot());assert.ok(resumed.encounter);resumed.enemies=[];resumed.encounter.wave=1e6;resumed.spawnTimer=1e6;step(resumed,5);assert.equal(resumed.s.voyage.resolved[s.id],'recovered');assert.ok(resumed.s.items.includes('brass'));const coins=resumed.s.coins;assert.equal(resumed.signalChoice(s.id,'work'),false);assert.equal(resumed.s.coins,coins);
});
check('rescue losses leave owned vessels intact and allow another attempt',()=>{
  const g=make(),s=g.signals.find(s=>s.kind==='rescue');moveTo(g,s);g.signalChoice(s.id,'work');assert.equal(g.guardAnchor(g.fleet[0]),g.encounter.boat);const before=g.s.fleet.length;g.hurt(g.encounter.boat,10000);assert.equal(g.encounter,null);assert.equal(g.s.fleet.length,before);assert.ok(g.signalChoice(s.id,'work'));g.player.x+=1200;g.step(1/60);assert.equal(g.encounter,null);assert.equal(g.s.voyage.resolved[s.id],undefined);
});
check('sea merchants require the exact quoted purse and usable cargo space',()=>{
  const g=make(),s=g.signals.find(s=>s.kind==='trader');moveTo(g,s);g.s.coins=s.price-1;assert.equal(g.signalChoice(s.id,'trade'),false);g.s.coins=s.price;g.addCargo('iron',999);assert.equal(g.signalChoice(s.id,'trade'),false);g.removeCargo('iron',999);g.removeCargo('sugar',999);assert.ok(g.signalChoice(s.id,'trade'));assert.equal(g.s.coins,0);assert.equal(g.quantity(s.good),s.qty);assert.equal(g.signalChoice(s.id,'trade'),false);
});
check('charters require their work and pay once; deliveries consume real cargo',()=>{
  const g=make();assert.equal(g.claimCharter(),false);g.s.stats.sugar=6;g.s.stats.fish=12;g.s.hull='brig';assert.ok(g.claimCharter());const coins=g.s.coins;assert.equal(g.claimCharter(),false);assert.equal(g.s.coins,coins);g.s.voyage.resolved.calypso='cargo';g.s.bosses.push('widow');g.s.visits.push('lisbon');assert.ok(g.claimCharter());g.s.port='reykjavik';g.addCargo('wood',18);assert.ok(g.charterDelivery('north-timber'));assert.equal(g.quantity('wood'),0);assert.equal(g.charterDelivery('north-timber'),false);assert.doesNotThrow(()=>new C.Game(earth,g.snapshot()));
});
check('the campaign can reach an ending and retain the sandbox without resetting it',()=>{
  const g=make();g.s.hull='leviathan';g.s.stats.sugar=6;g.s.stats.fish=12;g.s.stats.oil=20;g.s.visits=D.ports.map(p=>p.id);g.s.bosses=D.bosses.map(b=>b.id);g.s.voyage.resolved={calypso:'recovered','silent-station':'cleared'};g.s.voyage.worked={'iceland-bank':1,'japan-trench':1};g.s.voyage.deliveries=['north-timber'];
  for(const charter of D.charters){assert.equal(g.charter().id,charter.id);assert.ok(g.claimCharter());}assert.equal(g.charter(),null);const restored=new C.Game(earth,g.snapshot());assert.equal(restored.s.voyage.charters.length,6);assert.ok(restored.sail());assert.equal(restored.s.hull,'leviathan');
});
check('ramming tells lock direction, giving a moving captain a dodge window',()=>{
  const g=make();moveTo(g,W.point(-70,28));const e=g.spawn('rammer',g.player,true);e.x=g.player.x+350;e.y=g.player.y;e.specialCD=0;g.enemyAbility(e,.01,g.player);assert.equal(e.charge.phase,'aim');const angle=e.charge.angle;g.player.y+=300;g.enemyAbility(e,.5,g.player);assert.equal(e.charge.angle,angle);g.enemyAbility(e,.5,g.player);assert.equal(e.charge.phase,'run');
});
check('admirals use distinct attacks and mortars leave a real escape interval',()=>{
  const g=make();moveTo(g,W.point(-70,28));const e=g.spawn('boss',g.player,true);e.name='Admiral';e.bossId='widow';e.specialCD=0;g.enemyAbility(e,.01,g.player);assert.equal(e.attack.kind,'fan');e.attack=null;e.bossId='iron-king';e.specialCD=0;g.enemyAbility(e,.01,g.player);assert.equal(e.attack.kind,'mortar');assert.ok(g.hazards.length>=1);const hp=g.player.hp;g.player.x+=300;g.enemies=[];g.s.fleet=[];g.fleet=[];step(g,2.3);assert.equal(g.player.hp,hp);assert.equal(g.hazards.length,0);e.attack=null;e.bossId='last-light';e.specialCD=0;e.salvos=1;g.enemyAbility(e,.01,g.player);assert.equal(e.attack.kind,'ring');
});
console.log('Convoy and voyage checks complete.');
