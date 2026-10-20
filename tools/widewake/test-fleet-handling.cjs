/* Captain responsiveness, separate crews, station keeping and saved decisions. */
const assert=require('node:assert/strict');
const B=require('../../js/widewake-battle-core.js');
require('../../js/widewake-estuary-core.js');
const R=require('../../js/widewake-reach-game.js'),C=require('../../js/widewake-combat.js');
const dt=1/60,step=(game,n,input)=>{for(let i=0;i<n;i++)game.step(dt,input);};
const pose=s=>({x:s.x,y:s.y,angle:s.angle,vx:s.vx,vy:s.vy,turn:s.turn,throttle:s.throttle,helm:s.helm,followD:s.followD});
const check=s=>console.log('PASS '+s);

for(const type of ['launch','gunboat','flagship']){
  const g=new R.Game();g.rank=4;g.coins=100000;
  if(type!=='launch')assert.ok(g.changeHull(type));
  for(const role of ['trawler','gunboat','oilrig'])assert.ok(g.hire(role));
  for(const level of [0,5]){
    g.levels.engine=level;g.updateStats();
    assert.ok(g.ships.slice(1).every(s=>g.player.speed>s.speed*1.2),type+' can outrun every companion');
  }
}
const captain={...B.roles.flagship,id:0,x:0,y:0,vx:0,vy:0,angle:0};
const escort={...B.roles.gunboat,id:1,x:0,y:0,vx:0,vy:0,angle:0};
for(let i=0;i<60;i++){B.helmStep(captain,{x:1,y:0},dt);B.helmStep(escort,{x:1,y:0},dt);}
assert.ok(captain.x>escort.x*1.3,'even the large captain hull accelerates more promptly');
captain.vx=escort.vx=20;
for(let i=0;i<30;i++){B.helmStep(captain,{x:0,y:1},dt);B.helmStep(escort,{x:0,y:1},dt);}
assert.ok(captain.angle>escort.angle*1.25,'the captain can turn inside the escorts');
assert.ok(captain.vx>0,'a sharper turn still carries momentum');
check('all player hulls outrun their fleet; captain acceleration and turning remain physical');

const takeover=new R.Game();takeover.castOff();takeover.nextEncounter=1e9;
Object.assign(takeover.player,{x:0,y:2000,vx:20,vy:0,throttle:1});
assert.ok(takeover.setCourse(takeover.field.route(takeover.routeHull(),R.sites[2])));
const manual=R.Game.restore(takeover.save());manual.cancel();
takeover.step(dt,{x:1,y:0});manual.step(dt,{x:1,y:0});
assert.equal(takeover.route,null);assert.deepEqual(pose(takeover.player),pose(manual.player));
check('taking the helm cancels channel cruise without a one-frame speed penalty');

const crew=Array.from({length:12},(_,i)=>({...B.roles.gunboat,id:i+1,x:0,y:0,vx:31,vy:0,angle:0,helm:{x:1,y:0}}));
const reactions=new Map();
for(let frame=1;frame<=40;frame++)for(const s of crew){B.crewStep(s,{x:0,y:1},dt,1200+frame);if(s.angle>0&&!reactions.has(s.id))reactions.set(s.id,frame);}
assert.equal(reactions.size,12);assert.ok(new Set(reactions.values()).size>=8,'same hulls react at different times');
assert.ok(Math.max(...reactions.values())-Math.min(...reactions.values())>=12);
assert.ok(crew.every(s=>s.vx>0),'crews turn through an arc');
check('a sudden turn reaches individual crews over several beats, without synchronized snapping');

const battle=new C.Endgame({population:0}),fixed=battle.ships.slice(1).map(pose);
step(battle,180,{x:1,y:0});
assert.deepEqual(battle.ships.slice(1).map(s=>({x:s.x,y:s.y})),fixed.map(s=>({x:s.x,y:s.y})), 'holding crews ignore the captain circling them');
battle.toggleWork();step(battle,900,{x:1,y:0});
assert.ok(Math.hypot(battle.player.vx,battle.player.vy)>Math.max(...battle.ships.slice(1).map(s=>Math.hypot(s.vx,s.vy)))*1.2);
assert.ok(new Set(battle.ships.slice(1,13).map(s=>s.followAnchor.x.toFixed(2))).size>=10);
const before=battle.ships.map(pose);step(battle,1,{x:-1,y:0});
for(let i=0;i<battle.ships.length;i++)assert.ok(Math.hypot(battle.ships[i].x-before[i].x,battle.ships[i].y-before[i].y)<battle.ships[i].speed*dt*1.01);
battle.toggleWork();step(battle,4200,{});
assert.ok(battle.ships.filter(s=>s.working).every(s=>Math.hypot(s.x-battle.center.x-s.slot.x,s.y-battle.center.y-s.slot.y)<30));
assert.ok(battle.produced.fish>0&&battle.produced.oil>0);
const settled=battle.ships.slice(1).map(pose);step(battle,300,{x:-.1,y:.1});
assert.ok(battle.ships.slice(1).every((s,i)=>Math.hypot(s.x-settled[i].x,s.y-settled[i].y)<.1),'station slack prevents constant small corrections');
check('independent following positions, no jumps, held stations and working boats that catch up');

const g=new R.Game();g.rank=4;g.coins=10000;assert.ok(g.hire('trawler'));assert.ok(g.hire('gunboat'));g.castOff();g.nextEncounter=1e9;
assert.ok(g.setCourse(g.field.route(g.routeHull(),R.sites[0])));step(g,3000,{});
assert.ok(g.ships.slice(1).every(s=>s.helm),'active route has crew decisions');
const restored=R.Game.restore(g.save());
for(let frame=0;frame<900;frame++){
  g.step(dt);restored.step(dt);
  assert.deepEqual(restored.ships.map(pose),g.ships.map(pose));
  assert.ok(g.ships.every(s=>g.field.clearance(s)>=.12));
}
const old=JSON.parse(g.save());old.ships.forEach(s=>delete s.helm);assert.ok(R.Game.restore(JSON.stringify(old)));
for(const helm of [{x:2,y:0},{x:0,y:null},{x:1,y:1}]){
  const broken=JSON.parse(g.save());broken.ships[1].helm=helm;assert.throws(()=>R.Game.restore(JSON.stringify(broken)));
}
const legacy=JSON.parse(g.save());legacy.ships[1].helm.reverse=true;assert.equal('reverse' in R.Game.restore(JSON.stringify(legacy)).ships[1].helm,false);
check('channel crews stay in water; mid-decision saves resume exactly and validate older/new fields');
console.log(JSON.stringify({reactionFrames:Object.fromEntries(reactions),captainTurn:captain.angle,escortTurn:escort.angle}));
