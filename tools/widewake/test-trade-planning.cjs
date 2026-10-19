/* Price comparisons describe executable orders without changing the campaign. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../../js/widewake-core.js'),W=require('../../js/widewake-world.js'),D=require('../../js/widewake-data.js');
const earth=new W.Earth(JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/widewake/earth-land.geojson'))));
function check(name,fn){fn();console.log('PASS '+name);}
check('destination totals equal selling the cargo unit by unit, including pressure',()=>{
  for(const port of D.ports){const g=new C.Game(earth);g.s.port=port.id;g.s.cargo={sugar:30};g.s.claimed=g.goals().map(g=>g.id);g.s.impact[port.id+':sugar']=35;const quote=g.quoteMarket(port.id,'sugar',30),before=g.s.coins;for(let i=0;i<30;i++)assert.ok(g.trade('sugar',1,false));assert.equal(g.s.coins-before,quote.total);assert.equal(quote.qty,30);}
});
check('trade prospects distinguish owned cargo value from a new purchase and remain read-only',()=>{
  const g=new C.Game(earth),before=g.snapshot(),q=g.tradeProspects('sugar',9999).find(q=>q.port.id==='nassau');assert.equal(q.qty,12);assert.equal(q.cost,0);assert.equal(q.gain,q.sale-g.quoteTrade('sugar',12,false).total);const buy=g.tradeProspects('sugar',9999,true).find(q=>q.port.id==='nassau'),order=g.quoteTrade('sugar',9999,true);assert.deepEqual({qty:buy.qty,total:buy.cost},order);assert.equal(buy.gain,buy.sale-buy.cost);assert.ok(buy.cost<=g.s.coins);assert.deepEqual(g.snapshot(),before);
  g.s.cargo={sugar:40};g.s.fleet[0].cargo={sugar:12};assert.deepEqual(g.tradeProspects('sugar',5,true),[]);g.sail();assert.deepEqual(g.tradeProspects('sugar',5,true),[]);
});
check('route estimates follow water around the continent and include engine upgrades',()=>{
  const g=new C.Game(earth),from=g.ports.find(p=>p.id==='buenos-aires'),to=g.ports.find(p=>p.id==='valparaiso'),route=earth.route(from,to);assert.ok(route);const estimate=g.routeEstimate(route,from);assert.ok(estimate.distance>W.distance(from,to)*1.5);g.s.upgrades.engine=8;assert.ok(g.routeEstimate(route,from).seconds<estimate.seconds*.8);
});
check('taking the helm retains a destination through save and reload',()=>{
  const g=new C.Game(earth);g.navigate(g.ports.find(p=>p.id==='nassau'));g.step(.05,{x:1});assert.equal(g.autopilot,false);assert.equal(g.route.length,0);assert.equal(g.target.id,'nassau');const restored=new C.Game(earth,g.snapshot());assert.equal(restored.target.id,'nassau');assert.equal(restored.autopilot,false);g.startProduction();assert.equal(g.target.id,'nassau','a failed work command must not erase the course');
});
check('charter guidance checks actual workboats and recovers after their loss',()=>{
  const g=new C.Game(earth);g.s.stats.sugar=6;assert.equal(g.charterGuidance().focus,'trawler');g.buyBoat('trawler');assert.equal(g.charterGuidance().target,'bahama-bank');g.s.fleet=g.s.fleet.filter(f=>f.type!=='trawler');assert.equal(g.charterGuidance().service,'fleet');
  const oil=g.charterGuidance({kind:'stat',key:'oil',target:'north-sea',text:'Extract oil.'});assert.equal(oil.focus,'oilrig');assert.match(oil.text,/rank 3/);
});
console.log('Trade and route planning checks complete.');
