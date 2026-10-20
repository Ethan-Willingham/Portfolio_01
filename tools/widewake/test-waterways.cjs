/* Authored passages, measured travel, shared environmental forces and progression. */
const assert=require('node:assert/strict'),fs=require('node:fs');
const B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js'),R=require('../../js/widewake-reach-game.js'),W=global.WidewakeWaterways;
const dt=1/60,reports=[],out=process.env.WIDEWAKE_TEST_OUTPUT||'/tmp/widewake-waterways-review';fs.mkdirSync(out,{recursive:true});
const check=s=>console.log('PASS '+s);
function passage(from,to,type='launch',policy='sheltered'){
  const g=new R.Game(),p=E.ports.find(p=>p.id===from);if(type!=='launch'){g.coins=1e6;g.rank=4;assert.ok(g.changeHull(type));}
  Object.assign(g.player,{x:p.x,y:p.y,px:p.x,py:p.y});g.port=from;g.nextEncounter=1e9;
  const route=g.field.route({...g.routeHull(),routePolicy:policy},to);assert.ok(route,`${type} ${from} to ${to}`);g.castOff();g.setCourse(route);
  for(let i=0;i<40000&&!g.arrived;i++){g.step(dt);assert.equal(g.contact,'',`${from} to ${to}: ${g.contact}`);assert.equal(g.port,null,'no recovery jump');}
  assert.equal(g.arrived?.id,to,`${from} to ${to}`);assert.ok(g.field.clearance(g.player)>=.12);assert.ok(route.distance<4500,'adjacent ports cannot hide an unexpected detour');assert.ok(g.time>route.seconds*.8&&g.time<route.seconds*1.2,`ETA ${from}/${to}: ${g.time} versus ${route.seconds}`);
  reports.push({from,to,type,policy,metres:Math.round(route.distance),seconds:+g.time.toFixed(1),estimate:+route.seconds.toFixed(1),hull:+g.player.hp.toFixed(1),hazards:route.hazards});return g;
}
const first=passage('yard','lantern');assert.ok(first.time>=45&&first.time<=85);assert.equal(first.player.hp,first.player.maxHp);assert.ok(first.dock());assert.ok(first.trade('salt',8,false));assert.equal(first.rank,2);assert.ok(first.discoveries.includes('kites'));assert.ok(first.discoveries.includes('lanterns'));assert.ok(first.trade('grain',24,true));
const home=first.field.route(first.routeHull(),'yard');first.castOff();first.setCourse(home);for(let i=0;i<12000&&!first.arrived;i++)first.step(dt);assert.ok(first.dock());assert.ok(first.trade('grain',24,false));assert.ok(first.hire('trawler'));check('earned delivery in under 85 seconds, return trade and first trawler');

const legs=[['lantern','kilns'],['kilns','canopy'],['canopy','bells'],['bells','wheel'],['wheel','mill'],['mill','crown'],['glass','crown'],['reeds','kilns']];
for(const [a,b]of legs){passage(a,b);passage(b,a);}
for(const [a,b]of legs.filter(p=>!p.includes('reeds'))){passage(a,b,'flagship');passage(b,a,'flagship');}
check('every new adjacent passage sails in both directions, including the full frigate hull');
const risky=passage('glass','crown','launch','direct');assert.ok(risky.player.hp>0&&risky.player.hp<risky.player.maxHp-10,'the direct crossing costs real hull');
const g=new R.Game(),glass=E.ports.find(p=>p.id==='glass');Object.assign(g.player,{x:glass.x,y:glass.y});
const direct=g.field.route({...g.routeHull(),routePolicy:'direct'},'crown'),safe=g.field.route(g.routeHull(),'crown');assert.ok(direct.hazards.includes('furnace')&&direct.hazards.includes('eye'));assert.deepEqual(safe.hazards,[]);assert.ok(safe.distance-direct.distance>800);check('the sheltered volcanic passage physically bypasses both hazards at a measurable travel cost');

const field=new E.Field();field.time=20;const race=W.hazards[0],vortex=W.hazards[2],heat=W.hazards[1];
assert.ok(Math.hypot(field.sample(race.x,race.y).currentX,field.sample(race.x,race.y).currentY)>4);
const inner=field.sample(vortex.x+80,vortex.y),outer=field.sample(vortex.x+vortex.radius,vortex.y);assert.ok(inner.currentY>outer.currentY+3);assert.equal(field.sample(heat.x+heat.radius,heat.y).heat,0);assert.equal(field.sample(heat.x,heat.y).heat,heat.damage);
// Stop only engine steering in this fixture to isolate water displacement.
const helm=B.helmStep,crew=B.crewStep;B.helmStep=()=>{};B.crewStep=()=>{};
try{
  const drift=new R.Game();drift.coins=1e6;drift.rank=4;assert.ok(drift.hire('gunboat'));drift.castOff();drift.time=field.time;drift.field.time=field.time;
  for(const s of drift.ships){Object.assign(s,{x:race.x,y:race.y,angle:0,vx:0,vy:0,needsJoin:false,orderKey:'join',joinD:0,orderRoute:{points:[{x:race.x+100,y:race.y}],index:0}});}
  drift.convoyTrail=[{x:race.x,y:race.y,d:0}];drift.move({},dt);drift.followFleet(dt);
  drift.raiders.add(race.x,race.y,0,drift.random);drift.raiders.vx[0]=drift.raiders.vy[0]=0;drift.moveEnemy(0,dt);
  for(const [x,y]of [[drift.player.x,drift.player.y],[drift.ships[1].x,drift.ships[1].y],[drift.raiders.x[0],drift.raiders.y[0]]])assert.ok(Math.hypot(x-race.x,y-race.y)>.06,'all boat families drift');
}finally{B.helmStep=helm;B.crewStep=crew;}
check('currents and whirlpools act on player, companion and enemy motion');

const hot=new R.Game();hot.castOff();hot.nextEncounter=1e9;Object.assign(hot.player,{x:heat.x,y:heat.y,px:heat.x,py:heat.y});hot.raiders.add(heat.x,heat.y,0,hot.random);hot.raiders.vx[0]=hot.raiders.vy[0]=0;const hp=hot.player.hp,enemyHp=hot.raiders.hp[0];hot.moveEnemy(0,dt);assert.ok(hot.raiders.hp[0]<enemyHp);hot.raiders.count=0;hot.step(dt);assert.ok(hot.player.hp<hp);const saved=R.Game.restore(hot.save());for(let i=0;i<60;i++){hot.step(dt);saved.step(dt);}assert.equal(saved.player.hp,hot.player.hp);assert.equal(saved.player.x,hot.player.x);assert.equal(saved.field.time,hot.field.time);check('hot water causes real damage and environment time restores deterministically');

const difficulty=new R.Game();for(const p of E.ports){Object.assign(difficulty.player,{x:p.x,y:p.y});const original=difficulty.threat();difficulty.rank=4;difficulty.encounter=100000;difficulty.stats.watches=10000;assert.deepEqual(difficulty.threat(),original,'rank and grinding cannot inflate '+p.name);}
Object.assign(difficulty.player,{x:0,y:2000});const t=difficulty.threat();for(let i=0;i<20;i++)difficulty.wave(100);assert.ok(difficulty.raiders.count<=t.cap);Object.assign(difficulty.player,{x:-550,y:600});assert.equal(difficulty.wave(100),0);check('fixed geographical enemy tiers, finite admissions, and a safe home lake');

const legacy=JSON.parse(first.save());delete legacy.discoveries;for(const k of ['soldTools','soldGrain','soldOil'])delete legacy.stats[k];const restored=R.Game.restore(JSON.stringify(legacy));assert.deepEqual(restored.discoveries,[]);assert.equal(restored.coins,first.coins);assert.deepEqual(restored.ships.map(s=>s.manifest),first.ships.map(s=>s.manifest));
const visited=JSON.parse(first.save());visited.visited=E.ports.map(p=>p.id);visited.discoveries=W.landmarks.map(m=>m.id);assert.equal(R.Game.restore(JSON.stringify(visited)).visited.size,E.ports.length);check('old Reach saves and all new destinations survive validation');
for(const [port,good,count,key]of [['canopy','tools',12,'jungle'],['bells','grain',24,'bells'],['crown','oil',24,'crown']]){const g=new R.Game();g.port=port;g.player.manifest={};g.load(good,count);assert.ok(g.trade(good,count,false));assert.ok(g.earned.includes(key));const coins=g.coins;g.progress();assert.equal(g.coins,coins,'one-time delivery reward');assert.ok(R.Game.restore(g.save()).earned.includes(key));}
check('three new regional deliveries award once and retain their progress in simulation snapshots');
fs.writeFileSync(out+'/passages.json',JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports,null,2));
