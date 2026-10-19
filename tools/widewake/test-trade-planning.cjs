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
check('large export markets can load a real merchant convoy while keeping work holds reserved',()=>{
  const g=new C.Game(earth);g.s.coins=1e6;g.s.xp=30000;g.s.cargo={};g.s.claimed=g.goals().map(goal=>goal.id);g.buyHull('frigate');for(let i=0;i<6;i++)assert.ok(g.buyBoat('freighter'));assert.ok(g.buyBoat('trawler'));assert.ok(g.buyBoat('oilrig'));g.s.port='shanghai';
  const room=g.cargoSpace('cloth'),quote=g.quoteTrade('cloth',9999),before=g.s.coins;assert.ok(room>800);assert.equal(quote.qty,room);assert.ok(g.trade('cloth',9999));assert.equal(g.s.coins,before-quote.total);assert.equal(g.quantity('cloth'),room);assert.equal(g.quoteTrade('cloth',1).qty,0);assert.ok(g.fleet.filter(f=>['trawler','oilrig'].includes(f.type)).every(f=>C.count(f.data.cargo)===0));assert.ok(g.fleet.filter(f=>f.type==='freighter').every(f=>f.data.cargo.cloth===f.spec.hold));
  const saved=g.snapshot(),again=new C.Game(earth,saved);assert.deepEqual(again.quoteTrade('cloth',9999,false),g.quoteTrade('cloth',9999,false));assert.deepEqual(again.s.impact,g.s.impact);assert.ok(g.trade('cloth',9999,false));assert.ok(g.s.coins<before,'a bulk order must not create a same-port resale exploit');
});
check('port depth is regional, independent of the player, and spent stock recovers with passing days',()=>{
  const g=new C.Game(earth),small=g.market('nassau','pearl'),large=g.market('shanghai','cloth'),initial=g.market('yokohama','tea');assert.ok(large.stock>small.stock*4);g.s.xp=30000;g.s.coins=1e6;g.buyHull('leviathan');for(let i=0;i<9;i++)g.buyBoat('freighter');assert.deepEqual(g.market('yokohama','tea'),initial,'warehouses must not scale with the player');g.s.cargo={};g.s.claimed=g.goals().map(goal=>goal.id);g.s.port='yokohama';const quote=g.quoteTrade('tea',9999);assert.equal(quote.qty,initial.stock);assert.ok(g.trade('tea',9999));assert.equal(g.market('yokohama','tea').stock,0);assert.equal(g.quoteTrade('tea',1).qty,0);const used=g.s.impact['yokohama:tea'];g.sail();g.s.seconds=119.99;g.spawnTimer=1000;g.step(.02);assert.equal(g.s.day,2);assert.equal(g.s.impact['yokohama:tea'],used*.5);assert.ok(g.market('yokohama','tea').stock>300);assert.deepEqual(new C.Game(earth,g.snapshot()).market('yokohama','tea'),g.market('yokohama','tea'));
});
check('larger orders still match single-unit pricing across regional warehouses and demand',()=>{
  for(const id of ['havana','nassau','shanghai','muscat']){const s=C.fresh();s.coins=1e6;s.xp=30000;s.cargo={};const bulk=new C.Game(earth,s);bulk.s.claimed=bulk.goals().map(goal=>goal.id);bulk.buyHull('leviathan');for(let i=0;i<7;i++)bulk.buyBoat('freighter');bulk.s.port=id;const single=new C.Game(earth,bulk.snapshot()),good=D.ports.find(p=>p.id===id).cheap,q=bulk.quoteTrade(good,800);assert.ok(bulk.trade(good,800));for(let i=0;i<q.qty;i++)assert.ok(single.trade(good,1));assert.equal(bulk.s.coins,single.s.coins);assert.equal(bulk.quantity(good),single.quantity(good));assert.equal(bulk.s.impact[id+':'+good],single.s.impact[id+':'+good]);const sale=bulk.quoteTrade(good,9999,false);bulk.trade(good,9999,false);for(let i=0;i<sale.qty;i++)single.trade(good,1,false);assert.equal(bulk.s.coins,single.s.coins);}
});
check('taking the helm retains a destination through save and reload',()=>{
  const g=new C.Game(earth);g.navigate(g.ports.find(p=>p.id==='nassau'));g.step(.05,{x:1});assert.equal(g.autopilot,false);assert.equal(g.route.length,0);assert.equal(g.target.id,'nassau');const restored=new C.Game(earth,g.snapshot());assert.equal(restored.target.id,'nassau');assert.equal(restored.autopilot,false);g.startProduction();assert.equal(g.target.id,'nassau','a failed work command must not erase the course');
});
check('charter guidance checks actual workboats and recovers after their loss',()=>{
  const g=new C.Game(earth);g.s.stats.sugar=6;assert.equal(g.charterGuidance().focus,'trawler');g.buyBoat('trawler');assert.equal(g.charterGuidance().target,'bahama-bank');g.s.fleet=g.s.fleet.filter(f=>f.type!=='trawler');assert.equal(g.charterGuidance().service,'fleet');
  const oil=g.charterGuidance({kind:'stat',key:'oil',target:'north-sea',text:'Extract oil.'});assert.equal(oil.focus,'oilrig');assert.match(oil.text,/rank 3/);
});
console.log('Trade and route planning checks complete.');
