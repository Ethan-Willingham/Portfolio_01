/* A maximum fleet visits every port in wide formation. This is a quiet geography
   fixture, not an earned campaign or a claim about combat balance. */
const assert=require('node:assert/strict'),{W,C,earth,make}=require('./sea-fixtures.cjs');
const g=make();while(g.fleet.length<g.fleetLimit)assert.ok(g.buyBoat(g.fleet.length%3===0?'destroyer':'freighter'));while(g.s.upgrades.engine<8)assert.ok(g.upgrade('engine'));g.setGuard(g.fleet[0].uid,g.fleet.find(f=>f.type==='freighter').uid);g.formation='wide';g.bossSites=[];let ticks=0;
for(const port of g.ports.slice(1).concat(g.ports[0])){
 assert.ok(g.navigate(port));g.spawnTimer=1e9;const fleet=g.fleet.length;let elapsed=0;
 for(;elapsed<1600*60&&(g.autopilot||g.harborStragglers(port).length);elapsed++){
  g.step(1/60);ticks++;if(ticks%30===0)for(const f of g.fleet)assert.ok(earth.water(f.x,f.y,f.radius),'vessel entered land on the way to '+port.name);
 }
 assert.equal(g.autopilot,false,'flagship never arrived at '+port.name);assert.equal(g.fleet.length,fleet);assert.ok(g.harborStragglers(port).length===0,JSON.stringify({port:port.name,stranded:g.harborStragglers(port).map(f=>({name:f.data.name,position:W.geo(f.x,f.y),route:f.navRoute}))}));assert.ok(g.dock());console.log('PASS '+port.name+' / '+(fleet+1)+' boats / '+(elapsed/60).toFixed(1)+'s');
}
assert.equal(g.s.visits.length,24);console.log('PASS all 24 ports reached by the complete wide convoy, including its named guard; '+ticks+' simulation steps');
