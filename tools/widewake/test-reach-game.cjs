/* Connected voyages through the replacement world, including loss and restoration. */
const assert=require('node:assert/strict');
require('../../js/widewake-battle-core.js');require('../../js/widewake-estuary-core.js');
const R=require('../../js/widewake-reach-game.js'),E=global.WidewakeEstuary;
const g=new R.Game(),reports=[];
function sail(to,{dock=true,max=100000}={}){const route=g.field.route(g.routeHull(),to);assert.ok(route,'water route to '+(to.id||to));g.castOff();g.setCourse(route);for(let i=0;i<max;i++){g.step(1/60);if(g.port)throw Error('Flagship lost en route');if(g.arrived&&(!dock||g.dock())){reports.push({to:to.id||to,time:g.time,kills:g.kills,hulls:g.ships.map(s=>Math.ceil(s.hp))});return;}if(i%9000===0){const r=R.Game.restore(g.save());assert.equal(r.kills,g.kills);assert.deepEqual(r.ships.map(s=>s.manifest),g.ships.map(s=>s.manifest));}}throw Error('Passage stalled: '+JSON.stringify({to,report:g.report(),ships:g.ships.map(s=>({type:s.type,x:s.x,y:s.y})),enemies:g.raiders.count}));}
assert.equal(g.hire('trawler'),false);assert.equal(g.upgrade('engine'),false);assert.equal(g.trade('salt',1000,true),false);
sail('reeds');assert.ok(g.trade('salt',8,false));assert.equal(g.rank,2);assert.ok(g.earned.includes('salt'));assert.equal(g.hire('oilrig'),false);assert.equal(g.hire('trawler'),false,'shallow berth denies a deep worker');
assert.ok(g.trade('grain',24,true));sail('yard');assert.ok(g.trade('grain',24,false));assert.ok(g.hire('trawler'));assert.equal(g.ships.length,2);assert.equal(g.field.route(g.routeHull(),'reeds'),null,'fleet draft closes the shortcut');
sail(R.sites[0],{dock:false});assert.ok(g.startWork());for(let i=0;i<12000&&g.operation;i++)g.step(1/60);assert.equal(g.stats.watches,1);assert.equal(g.rank,3);assert.ok(g.amount('fish')>=30);assert.ok(g.collection.includes('Glass mullet'));assert.ok(g.kills>20);sail('yard');assert.ok(g.trade('fish',g.amount('fish'),false));assert.ok(g.trade('relic',g.amount('relic'),false));assert.ok(g.upgrade('engine'));
// A restored active operation must have exactly the same future, including RNG.
g.coins=14000;assert.ok(g.hire('gunboat'));assert.ok(g.hire('oilrig'));assert.ok(g.changeHull('gunboat'));sail(R.sites[2],{dock:false});assert.ok(g.startWork());for(let i=0;i<1500;i++)g.step(1/60);const restored=R.Game.restore(g.save());for(let i=0;i<200;i++){g.step(1/60);restored.step(1/60);}for(const k of ['coins','kills','workTime','time'])assert.equal(restored[k],g[k],k);assert.deepEqual(restored.ships.map(s=>s.manifest),g.ships.map(s=>s.manifest));for(let i=0;i<12000&&g.operation;i++)g.step(1/60);assert.ok(g.stats.oil>0);assert.equal(g.rank,4);sail('yard');
// Full convoy route uses the main river. All actual hulls, not just the flagship,
// must arrive in physical water at the second commercial port.
sail('mill');assert.ok(g.trade('timber',12,true));sail('yard');assert.ok(g.trade('timber',12,false));assert.ok(g.earned.includes('timber'));for(const s of g.ships)assert.ok(g.field.clearance(s)>=.12,s.name);
const bad=JSON.parse(g.save());bad.ships[0].x=Infinity;assert.throws(()=>R.Game.restore(JSON.stringify(bad)));assert.throws(()=>R.Game.restore('{"coins":900}'));
g.castOff();g.hurt(g.player,1e9);g.step(1/60);assert.equal(g.port,'yard');assert.equal(g.amount('timber'),0);assert.ok(g.player.hp>0);assert.ok(g.coins>=100);assert.ok(R.Game.restore(g.save()));
console.log('PASS earned trade, fleet draft, fishing, oil, cargo, combat, save continuation, river convoy and recovery');console.log(JSON.stringify(reports,null,2));
