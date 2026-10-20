/* Handling, shot ownership, honest aim guides and the two physical gun banks. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const B=require('../../js/widewake-battle-core.js'),O=require('../../js/widewake-ocean.js');
const dt=1/60,check=s=>console.log('PASS '+s),close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const vessel=type=>({...B.roles[type],x:0,y:0,vx:0,vy:0,angle:0,turn:0});
const handling=[];
for(const type of ['flagship','gunboat','trawler','oilrig']){
  const s=vessel(type);let ninetyFive=0;
  for(let frame=0;frame<900;frame++){
    B.helmStep(s,{x:1,y:0},dt);
    if(!ninetyFive&&s.vx>=s.speed*.95)ninetyFive=(frame+1)*dt;
  }
  close(Math.hypot(s.vx,s.vy),s.speed);
  const x=s.x;B.helmStep(s,{},dt);assert.ok(s.vx>s.speed*.9,'releasing the helm cannot instantly stop a hull');
  let stopped=dt;while(Math.hypot(s.vx,s.vy)>.03&&stopped<20){B.helmStep(s,{},dt);stopped+=dt;}
  assert.ok(stopped<13&&s.vx===0&&s.vy===0);assert.ok(s.x-x>5);
  handling.push({type,length:s.length,width:s.width,speed:s.speed,secondsTo95Percent:ninetyFive,brakingSeconds:stopped,brakingMetres:s.x-x});
}
assert.ok(handling[0].brakingMetres>45&&handling[0].brakingMetres<65);
const turn=vessel('flagship');turn.vx=turn.speed;B.helmStep(turn,{x:-1,y:0},dt);assert.ok(turn.vx>0,'reverse input first brakes and turns');assert.ok(Math.abs(turn.angle)<.04);
let maxTurn=0;for(let n=0;n<600;n++){const old=turn.angle;B.helmStep(turn,{x:-1,y:0},dt);maxTurn=Math.max(maxTurn,Math.abs(B.angleDelta(turn.angle,old))/dt);}
assert.ok(turn.vx<-turn.speed*.95);assert.ok(maxTurn<1.25);
for(const input of [{x:1,y:0},{x:1,y:1},{x:.2,y:.2}]){const s=vessel('flagship');for(let i=0;i<900;i++)B.helmStep(s,input,dt);assert.ok(Math.hypot(s.vx,s.vy)<=s.speed+1e-6);close(-s.vx*Math.sin(s.angle)+s.vy*Math.cos(s.angle),0);}
check('finite acceleration, hull-relative turns, braking, analog throttle and equal diagonal speed');

// The faster captain can open a larger gap. Give the slowest oil boat 70
// seconds to make the physical return, without snapping it onto the station.
const convoy=new B.Battle({population:0});convoy.toggleWork();for(let i=0;i<1800;i++)convoy.step(dt,{x:.8,y:.6});convoy.toggleWork();for(let i=0;i<4200;i++)convoy.step(dt,{x:0,y:0});
assert.ok(convoy.ships.filter(s=>s.working).every(s=>Math.hypot(s.x-convoy.center.x-s.slot.x,s.y-convoy.center.y-s.slot.y)<30));assert.ok(convoy.produced.fish>0&&convoy.produced.oil>0);
check('a moving convoy turns back onto its working stations and resumes real production');

const volley=new B.Battle({population:0});volley.mounts=[];volley.player.angle=0;
assert.equal(volley.broadside(),true);assert.equal(volley.shots.count,2);assert.equal(volley.broadside(),false);
for(let frame=0;frame<30;frame++)volley.step(dt);
assert.equal(volley.shots.count,48);assert.equal(volley.burstCursor,48);
let port=0,starboard=0;for(let i=0;i<48;i++){const s=volley.shots;assert.equal(s.owner[i],0);assert.ok(Math.abs(s.vx[i]/B.BROADSIDE.speed)<.29);if(s.vy[i]>0)port++;else starboard++;}
assert.equal(port,24);assert.equal(starboard,24);
for(const angle of [-Math.PI,-1.7,0,.8,Math.PI])for(const side of [0,1]){
  const ship={...volley.player,x:137,y:-83,angle},hull=B.broadsideFootprint(ship,side);
  for(let i=side;i<48;i+=2){const s=B.broadsideRound(ship,i);for(const distance of [0,500,B.BROADSIDE.range+120]){
    const p={x:s.x+Math.cos(s.angle)*distance,y:s.y+Math.sin(s.angle)*distance};
    for(let n=0;n<hull.length;n++){const a=hull[n],b=hull[(n+1)%hull.length];assert.ok((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)>-1e-6,'every actual lane lies inside its preview');}
  }}
}
check('rolling broadside fires 24 rounds per bank and its preview contains every real lane');

const ship=vessel('flagship'),reach=B.weapons.gun.range+120;
for(const angle of [-2.8,-1.2,0,1.4,3])for(const x of [-30,0,30]){
  const distance=B.rayReach(x,4,angle,ship,reach),pool=new B.Shots(),world=new B.Battle({population:0});world.mounts=[];
  close(Math.hypot(x+Math.cos(angle)*distance,4+Math.sin(angle)*distance),reach);
  pool.fire(x,4,x+Math.cos(angle)*1000,4+Math.sin(angle)*1000,B.weapons.gun,0,0,distance);
  while(pool.count){pool.step(dt,world);assert.ok(Math.hypot(pool.x[0],pool.y[0])<reach+.02,'no extra simulation tick beyond the indicated range');}
}
const within=O.aimGuide(ship,{x:300,y:200}),beyond=O.aimGuide(ship,{x:1500,y:0});assert.equal(within.inRange,true);assert.equal(beyond.inRange,false);close(Math.hypot(beyond.x,beyond.y),reach);
check('manual projectile lifetime ends at the displayed reach, including offset muzzle positions');

const hit=new B.Battle({population:0});hit.mounts=[];hit.control.fire=true;hit.raiders.add(20,0,0,B.random(2));hit.raiders.index();hit.shots.fire(0,0,100,0,{...B.weapons.gun,speed:3000},0,0);hit.shots.step(dt,hit);assert.equal(hit.lastHit.time,hit.time);close(hit.lastHit.x,20);assert.equal(hit.kills,1);
const impact=new B.Battle({population:0});for(let n=0;n<1000;n++)impact.impact(n,0,true);assert.equal(impact.effects.count,16);assert.ok(impact.sounds.length<=8);
const compact=new B.Raiders();compact.add(0,0,0,B.random(1));compact.add(777,2,0,B.random(2));compact.px[1]=666;compact.hp[0]=0;compact.compact();assert.equal(compact.px[0],666);assert.equal(compact.x[0],777);
check('manual hits have owned feedback, impact work is bounded, and compaction retains interpolation history');
const out=process.env.WIDEWAKE_TEST_OUTPUT||path.join(os.tmpdir(),'widewake-battle-feel');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'handling.json'),JSON.stringify({handling,maxTurnRadiansPerSecond:maxTurn},null,2)+'\n');console.log(JSON.stringify(handling,null,2));
