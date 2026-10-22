const assert=require('node:assert/strict');
const W=require('../../js/widewake-waves.js'),B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js'),R=require('../../js/widewake-reach-game.js');
function run({speed=36,large=false,shelter=false,flat=false,dt=1/60}={}){
  const sea=new W.Sea(shelter?{sample:(x,y,out={})=>Object.assign(out,{depth:9,salinity:.77})}:null),s={...(large?B.roles.gunboat:E.vessels.launch),id:0,type:large?'gunboat':'launch',speed:large?72:36,x:shelter?-550:0,y:shelter?600:2400,angle:0,vx:speed,vy:0,hp:100,hold:32,cargo:0};
  if(flat)sea.strength=0;let jumps=0,landings=0,maxGap=0,maxHeight=0,airStart=0;const durations=[],impacts=[];
  for(let n=0;n<60/dt;n++){
    const before=s.sea&&{...s.sea};sea.begin(n*dt);B.helmStep(s,{throttle:speed/s.speed,steer:0},dt);sea.stepShip(s,dt);
    const q=s.sea;if(q.airborne&&!before?.airborne){jumps++;airStart=n*dt;assert.ok(q.vz>2,'a crest produces upward launch velocity');}
    if(q.airborne&&before?.airborne){assert.ok(Math.abs(q.vz-before.vz+12.5*dt)<1e-8,'flight follows gravity instead of a water spring');assert.ok(Math.abs(q.z-before.z-before.vz*dt+6.25*dt*dt)<1e-8);}
    if(before?.airborne&&!q.airborne){landings++;durations.push(n*dt-airStart);impacts.push(q.impact);assert.ok(q.landAt===sea.time&&q.landCount===landings);assert.ok(q.impact>2&&q.z<=q.surface,'landing occurs at the water with a physical impact');assert.ok(q.contact===1);}
    if(q.airborne)assert.equal(q.contact,0);maxGap=Math.max(maxGap,q.z-q.surface);maxHeight=Math.max(maxHeight,q.z);
    assert.ok(Number.isFinite(q.z)&&Math.abs(q.z)<8&&Math.hypot(q.pitch,q.roll)<.481);
  }
  return{jumps,landings,maxGap,maxHeight,durations,impacts,ship:s,sea};
}
const open=run(),yard=run({shelter:true}),coarse=run({dt:1/30});
for(const [name,r]of [['open',open],['yard',yard]]){
  assert.ok(r.jumps>=14&&r.landings>=r.jumps-1,name+' has repeated crest takeoffs and real splashdowns');
  assert.ok(r.maxGap>1.2&&r.durations.every(t=>t>.4&&t<2.1),name+' has clearly visible, bounded airtime');
}
assert.ok(Math.abs(coarse.jumps-open.jumps)<=2,'crest detection remains stable across fixed timesteps');
assert.ok(Math.abs(coarse.maxGap-open.maxGap)<1.4,'flight height converges across timesteps');
for(const options of [{speed:12},{large:true,speed:72},{flat:true}])assert.equal(run(options).jumps,0,'slow, heavy and flat-water controls stay supported');
// Braking and rudder cannot turn water grip into mid-air thrust.
const air={...E.vessels.launch,speed:36,x:0,y:0,angle:0,vx:36,vy:0,turn:0,sea:{airborne:true}};
B.helmStep(air,{throttle:-1,steer:1},.1);assert.ok(air.vx>35.5&&Math.abs(air.vy)<1e-6);assert.ok(air.x>3.5);
// Mid-flight test snapshots retain every ballistic/event field and continue exactly.
const g=new R.Game();g.castOff();Object.assign(g.player,{x:0,y:2400,px:0,py:2400,vx:36,vy:0,angle:0});g.nextEncounter=1e9;g.mounts=[];
for(let n=0;n<900&&!g.player.sea?.airborne;n++)g.step(1/60,{throttle:1,steer:0});assert.ok(g.player.sea.airborne);
const again=R.Game.restore(g.save());assert.deepEqual(again.player.sea,g.player.sea);
for(let n=0;n<180;n++){g.step(1/60,{throttle:1,steer:0});again.step(1/60,{throttle:1,steer:0});assert.deepEqual(again.player.sea,g.player.sea);assert.equal(again.player.x,g.player.x);}
console.log('PASS crest-driven launch flight, gravity, splashdown, air momentum, heavy/slow/flat controls, timestep convergence and exact continuation');
console.log(JSON.stringify({open:{jumps:open.jumps,landings:open.landings,maxGap:open.maxGap},yard:{jumps:yard.jumps,landings:yard.landings,maxGap:yard.maxGap},coarse:{jumps:coarse.jumps,maxGap:coarse.maxGap}},null,2));
