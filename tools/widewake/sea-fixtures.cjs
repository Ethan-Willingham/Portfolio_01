/* Valid, deliberately staged battles for persistence and browser interruption checks.
   Campaign balance is checked separately by the earned captain. */
const fs=require('node:fs'),path=require('node:path');
const D=require('../../js/widewake-data.js'),W=require('../../js/widewake-world.js'),C=require('../../js/widewake-core.js');
const earth=new W.Earth(JSON.parse(fs.readFileSync(path.join(__dirname,'../../assets/widewake/earth-land.geojson'))));
function make(){const s=C.fresh();s.seed=744;s.coins=1000000;s.xp=D.ranks.at(-1);s.settings.reduceMotion=false;const g=new C.Game(earth,s);g.buyHull('leviathan');g.upgrade('hull');g.buyBoat('trawler');g.buyBoat('oilrig');g.buyBoat('repair');return g;}
function place(g,p){g.sail();Object.assign(g.player,{x:p.x,y:p.y,vx:0,vy:0});g.wake=[{x:p.x,y:p.y}];for(const [i,f]of g.fleet.entries()){const q=earth.nearestWater({x:W.wrap(p.x-60-i*35),y:p.y+45},15);Object.assign(f,q);f.wake=[{...q}];}g.spawnTimer=40;return g;}
function boss(id='widow'){
  const g=make(),site=g.bossSites.find(b=>b.id===id);place(g,site);g.step(1/60);const e=g.enemies.find(e=>e.bossId===id);g.damage(e,e.maxHp*.6);g.enemyAbility(e,.01,g.player);e.specialCD=0;g.enemyAbility(e,.01,g.player);
  // A moving broadside and salvage coexist with the pending special attack.
  g.burst();g.player.vx=68.75;g.player.vy=-27.125;g.drops.push({x:W.wrap(g.player.x+90),y:g.player.y+30,t:32.125,kind:'cargo',item:'iron'},{x:W.wrap(g.player.x+110),y:g.player.y+20,t:44.5,kind:'relic',item:'magnet'});
  return g;
}
function dense(){
  const g=make();while(g.fleet.length<g.fleetLimit){if(!g.buyBoat('freighter'))throw Error('Could not assemble persistence fixture.');}place(g,W.point(-140,10));
  for(let i=0;i<1200;i++){const e=g.spawn(['skiff','gunner','rammer','armored'][i%4],g.player,true,{x:W.wrap(g.player.x+(i%40-20)*38),y:g.player.y+(Math.floor(i/40)-15)*38});e.cd=(i%29)/10;e.specialCD=2.75;}
  for(let i=0;i<3500;i++)g.shoot(g.enemies[i%1200],i*.1,18,i%2===0,{life:3.8,speed:240,quiet:true});
  for(let i=0;i<4096;i++)g.drops.push({x:W.wrap(g.player.x+(i%60-30)*4),y:g.player.y+(Math.floor(i/60)-30)*4,t:35,kind:i%5===0?'relic':'cargo',item:i%5===0?'magnet':'iron'});
  const track=n=>Array.from({length:n},(_,i)=>({x:W.wrap(g.player.x+Math.sin(i)*1000),y:g.player.y+Math.cos(i)*1000}));
  g.wake=track(1000);for(const f of g.fleet){f.navRoute=track(128);if(['trawler','oilrig','freighter'].includes(f.type))f.wake=track(240);}
  g.route=track(2048);g.target={...g.route.at(-1),name:'Open Pacific'};g.autopilot=true;g.navLeg=g.route[0];g.navProbeTime=.625;g.navProbeDistance=1000;g.navBlocked=.2;
  return g;
}
module.exports={D,W,C,earth,make,place,boss,dense};
