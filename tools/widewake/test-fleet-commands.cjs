/* Real manifests and physical navigation, including failed commands. */
const assert=require('node:assert/strict');
require('../../js/widewake-battle-core.js');require('../../js/widewake-estuary-core.js');
const R=require('../../js/widewake-reach-game.js');
const g=new R.Game();g.rank=4;g.coins=100000;
for(const type of ['trawler','gunboat','repair'])assert.ok(g.hire(type));
const a=g.ships[0],b=g.ships[1];
const totals=()=>({coins:g.coins,cargo:g.cargo,salt:g.amount('salt')});
const before=totals();assert.ok(g.transferCargo(a.id,b.id,'salt',5));
assert.equal(a.manifest.salt,3);assert.equal(b.manifest.salt,5);assert.deepEqual(totals(),before);
assert.equal(a.cargo,R.used(a));assert.equal(b.cargo,R.used(b));
for(const args of [[0,0,'salt',1],[0,99,'salt',1],[0,1,'salt',4],[0,1,'salt',.5],[0,1,'salt',0],[0,1,'unknown',1]]){
  const ships=JSON.stringify(g.ships);assert.equal(g.transferCargo(...args),false);assert.equal(JSON.stringify(g.ships),ships);
}
b.manifest.grain=b.hold-R.used(b);assert.equal(g.transferCargo(0,1,'salt',1),false);delete b.manifest.grain;
b.hp=0;assert.equal(g.transferCargo(0,1,'salt',1),false);b.hp=b.maxHp;
assert.equal(g.setConvoyOrder('teleport'),false);assert.equal(g.convoyOrder,'spaced');
assert.ok(g.setConvoyOrder('close'));assert.equal(R.Game.restore(g.save()).convoyOrder,'close');
const older=JSON.parse(g.save());delete older.convoyOrder;assert.equal(R.Game.restore(JSON.stringify(older)).convoyOrder,'spaced');
g.castOff();assert.equal(g.transferCargo(1,0,'salt',1),false);
// Both orders must follow the checked trail through a bend without moving hulls
// at command time. A long convoy still needs real travel to gather at port.
for(const order of ['close','spaced']){
  const p=new R.Game();p.rank=4;p.coins=100000;
  for(const type of ['gunboat','trawler','repair'])assert.ok(p.hire(type));
  const positions=p.ships.map(s=>[s.x,s.y]);assert.ok(p.setConvoyOrder(order));
  assert.deepEqual(p.ships.map(s=>[s.x,s.y]),positions);
  const route=p.field.route(p.routeHull(),'lantern');assert.ok(route);p.castOff();p.setCourse(route);p.nextEncounter=1e9;
  let arrived=false;
  for(let i=0;i<21000;i++){
    p.step(1/60);
    if(i%90===0)for(const s of p.ships)assert.ok(p.field.clearance(s)>=.1,s.name+' left navigable water with '+order);
    if(p.arrived&&p.dock()){arrived=true;break;}
  }
  assert.ok(arrived,order+' convoy did not gather');
}
console.log('PASS conserved dockside cargo, rejected unavailable commands and physical close/spaced convoy arrivals');
