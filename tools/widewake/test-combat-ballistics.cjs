/* Actual gun barrels, vertical clearance, momentum and visible contact events. */
const assert=require('node:assert/strict'),B=require('../../js/widewake-battle-core.js');
const dt=1/60,random=B.random(31),close=(a,b,t=.003)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function fixture(waves=false){const b=new B.Battle({population:0});b.mounts=[];b.sea.strength=waves?1:0;return b;}
function enemy(b,x,y,kind=0,hp=1000){const a=b.raiders;a.add(x,y,kind,random);const i=a.count-1;a.hp[i]=hp;a.angle[i]=a.previousAngle[i]=0;a.steeringReady[i]=a.surfaceReady[i]=1;a.surface[i]=b.sea.at(x,y,b.time,{},-1,false).height;a.index();return i;}
function run(b,steps=180){for(let n=0;n<steps&&b.shots.count;n++){b.time+=dt;b.shots.step(dt,b);}}

// The muzzle follows the same rigid rotation as its barrel, not a floating
// point guessed from the centre of an otherwise pitching and rolling boat.
const m=fixture(),s=m.player,mount={weapon:'guard',along:20,angle:Math.PI/2,recoil:0};
Object.assign(s,{x:10,y:20,angle:0,sea:{z:3,pitch:.2,roll:-.15}});const p=B.muzzlePoint(s,mount,{}),scale=.85,wz=Math.min(8,s.height*.28)+.2+4*scale;
close(Math.hypot(p.x-s.x,p.y-s.y,p.z-3),Math.hypot(20,13*scale,wz),1e-8);assert.ok(p.z>3+wz);
const calm=B.muzzlePoint(s,mount,{}, {x:10,y:20,angle:0,z:0,pitch:0,roll:0});close(calm.x,30);close(calm.y,20+13*scale);close(calm.z,wz);

// The projectile's collision radius is its small bore allowance, not the
// screen-space width of the tracer. Sparks stay on the actual struck surface.
const edgeMiss=fixture();enemy(edgeMiss,50,0,2);edgeMiss.shots.fire(0,4.16,100,4.16,B.weapons.guard,0,0,200,1,1);run(edgeMiss);assert.equal(edgeMiss.shots.contacts,0);assert.equal(edgeMiss.raiders.hp[0],1000);
const edgeHit=fixture();enemy(edgeHit,50,0,2);edgeHit.shots.fire(0,3.9,100,3.9,B.weapons.guard,0,0,200,1,1);run(edgeHit);assert.equal(edgeHit.shots.contacts,1);
const edgeIndex=Array.from(edgeHit.effects.kind.subarray(0,edgeHit.effects.count)).indexOf(4),hx=edgeHit.effects.x[edgeIndex]-50,hy=edgeHit.effects.y[edgeIndex],outline=B.HULL_OUTLINE.map(([x,y])=>[x*23,y*8]);let edgeDistance=Infinity;
for(let i=0;i<outline.length;i++){const p=outline[i],q=outline[(i+1)%outline.length],dx=q[0]-p[0],dy=q[1]-p[1],t=Math.max(0,Math.min(1,((hx-p[0])*dx+(hy-p[1])*dy)/(dx*dx+dy*dy)));edgeDistance=Math.min(edgeDistance,Math.hypot(hx-p[0]-dx*t,hy-p[1]-dy*t));}
assert.ok(edgeDistance<.11,'the struck surface cannot be inflated to fit a fat tracer');

// An elevated visible round passes over the foreground skiff, then crosses
// the intended boat's deck. A planform overlap alone cannot cause damage.
const high=fixture();enemy(high,40,0);enemy(high,100,0);
high.shots.fire(0,0,100,0,B.weapons.guard,0,0,300,8,1.05);run(high);
assert.equal(high.raiders.hp[0],1000);assert.equal(high.raiders.hp[1],970);assert.equal(high.shots.contacts,1);
const strike=Array.from(high.effects.kind.subarray(0,high.effects.count)).indexOf(4);assert.ok(strike>=0);assert.ok(high.effects.x[strike]>94&&high.effects.x[strike]<103);assert.ok(high.effects.height[strike]<=1.43);close(high.effects.angle[strike],0);

const hostile=fixture();hostile.ships.forEach(s=>s.hp=0);
Object.assign(hostile.ships[1],{x:40,px:40,y:0,py:0,angle:0,previousAngle:0,hp:1000,sea:{z:0}});
Object.assign(hostile.player,{x:100,px:100,y:0,py:0,angle:0,previousAngle:0,hp:1000,sea:{z:0}});
hostile.shots.fire(0,0,100,0,B.weapons.hostile,0,255,300,8,1.05);run(hostile);
assert.equal(hostile.ships[1].hp,1000);assert.equal(hostile.player.hp,987);
console.log('PASS rigid muzzle pose and genuine vertical deck clearance in both firing directions');

// These are the actual regional wave equations. Target decks follow their
// cached sea elevation, including troughs below the world zero plane.
const elevations=[];
for(const time of [0,4,9])for(const friendly of [true,false]){
  const b=fixture(true);b.time=time;const x=400,y=1800,source=b.sea.at(x-40,y,time,{},-1,false).height,water=b.sea.at(x,y,time,{},-1,false).height;elevations.push(water);
  if(friendly){const i=enemy(b,x,y,3);b.shots.fire(x-40,y,x,y,B.weapons.guard,0,0,200,source+12,water+1.6);run(b,30);assert.equal(b.raiders.hp[i],970,'round must hit the wave-relative enemy deck');}
  else{b.ships.forEach(s=>s.hp=0);const ship=b.ships[1];Object.assign(ship,{x,px:x,y,py:y,angle:0,previousAngle:0,hp:1000,sea:{z:water}});b.shots.fire(x-40,y,x,y,B.weapons.hostile,0,255,200,source+12,water+1.6);run(b,30);assert.equal(ship.hp,987,'hostile round must hit the wave-relative friendly deck');}
}
assert.ok(Math.max(...elevations)-Math.min(...elevations)>.2);

for(const waves of [false,true]){
  const b=fixture(waves);b.time=7;const x=400,y=1800,h=b.sea.at(x,y,b.time,{},-1,false).height;
  b.shots.fire(x,y,x+100,y,B.weapons.guard,0,0,500,h+8,h+1.05);run(b);assert.equal(b.shots.count,0);assert.equal(b.shots.contacts,0);
  const i=Array.from(b.effects.kind.subarray(0,b.effects.count)).indexOf(5);assert.ok(i>=0,'missed round must end in a water strike');
  close(b.effects.height[i],b.sea.at(b.effects.x[i],b.effects.y[i],b.time,{},-1,false).height,.035);assert.ok(b.effects.x[i]>x+50&&b.effects.x[i]<x+200);
}
const bank=fixture();bank.clearShot=(x,y,tx)=>tx<60;bank.shots.fire(0,0,100,0,B.weapons.guard,0,0,500,8,1.05);run(bank);assert.equal(bank.effects.count,0,'bank-stopped rounds cannot splash beyond the bank');
const mortarBank=fixture();mortarBank.clearShot=(x,y,tx)=>tx<60;enemy(mortarBank,100,0,3);mortarBank.shots.fire(0,0,100,0,B.weapons.mortar);run(mortarBank);assert.equal(mortarBank.raiders.hp[0],1000);assert.equal(mortarBank.shots.count,0);assert.equal(mortarBank.shots.detonations,0,'lofted shell cannot damage through a bank');
const mortarAim=fixture();mortarAim.clearShot=()=>false;enemy(mortarAim,100,0,3);mortarAim.mounts=[{ship:0,weapon:'mortar',along:0,angle:0,flash:0,recoil:0,cooldown:0}];for(let n=0;n<20;n++)B.fireFleet(mortarAim,dt);assert.equal(mortarAim.shots.count,0,'blocked mortar orders must not fire');
console.log('PASS actual moving-wave deck contacts, calm/wave water strikes and bank occlusion');

// A moving firing ship imparts velocity. Automatic lead compensates for that
// motion, rather than merely leading the target from a stationary platform.
for(const targetSpeed of [0,36]){
  const b=fixture(),ship=b.player;Object.assign(ship,{x:-400,px:-400,y:0,py:0,vx:0,vy:72,angle:0,previousAngle:0,sea:{z:0,pitch:0,roll:0}});b.ships.slice(1).forEach(s=>s.hp=0);
  const i=enemy(b,0,0,3),a=b.raiders;a.vx[i]=0;a.vy[i]=targetSpeed;a.index();b.mounts=[{ship:0,weapon:'guard',along:0,angle:0,flash:0,recoil:0,cooldown:0}];
  B.fireFleet(b,dt);assert.equal(b.shots.count,1);assert.ok(b.shots.vy[0]>=targetSpeed-3&&b.shots.vy[0]<=targetSpeed+3);close(b.shots.startHeight[0],b.mounts[0].muzzleZ);
  for(let n=0;n<90&&b.shots.count;n++){b.time+=dt;a.px[i]=a.x[i];a.py[i]=a.y[i];a.x[i]+=a.vx[i]*dt;a.y[i]+=a.vy[i]*dt;a.index();b.shots.step(dt,b);}
  assert.equal(a.hp[i],970,'inherited velocity must not make the moving flagship miss');
}

const aim=fixture();aim.player.x=aim.player.y=0;enemy(aim,-200,0,3);aim.mounts=[{ship:0,weapon:'guard',along:0,angle:0,flash:0,recoil:0,cooldown:0}];
let first=-1,previous=0;
for(let n=0;n<90;n++){aim.time+=dt;B.fireFleet(aim,dt);const angle=aim.mounts[0].angle;assert.ok(Math.abs(B.angleDelta(angle,previous))<=5.5*dt+.0001);previous=angle;if(aim.shots.count){first=n;break;}}
assert.ok(first>25&&first<70,'a gun must traverse before firing through the opposite side of its mount');
const fleet=fixture();fleet.fired=new Uint32Array(24);fleet.weaponShots=new Uint32Array(4);fleet.mounts=fleet.ships.map((s,i)=>{Object.assign(s,{x:i*2,y:0,angle:0,sea:{z:0,pitch:0,roll:0}});return{ship:i,weapon:'guard',along:0,angle:-Math.PI/2,flash:0,recoil:0,cooldown:i*.01};});enemy(fleet,200,0,3,100000);
for(let n=0;n<180;n++){fleet.time+=dt;B.fireFleet(fleet,dt);}assert.equal(Array.from(fleet.fired).filter(n=>n>0).length,24);assert.ok(fleet.shots.count<B.LIMITS.shots);
console.log('PASS inherited firing-boat momentum, compensated leads, bounded turret traverse and all 24 firing vessels');

const feedback=fixture(),j=enemy(feedback,30,0,3,10000);feedback.shots.fire(0,3,100,3,B.weapons.guard,0,0,200,1,1);run(feedback,5);
assert.ok(feedback.raiders.pushX[j]>0&&feedback.raiders.pushX[j]<3);assert.ok(feedback.raiders.turn[j]<0);assert.equal(feedback.raiders.x[j],30,'impacts cannot teleport a target or invalidate the spatial grid');
feedback.raiders.vx[j]=12;feedback.raiders.vy[j]=3;feedback.raiders.surface[j]=2;feedback.raiders.angle[j]=.7;feedback.kill(j);const wreck=Array.from(feedback.effects.kind.subarray(0,feedback.effects.count)).indexOf(6);assert.ok(wreck>=0);close(feedback.effects.total[wreck],2.4);assert.equal(feedback.effects.variant[wreck],3);close(feedback.effects.height[wreck],2);close(feedback.effects.angle[wreck],.7);assert.ok(feedback.effects.vx[wreck]>12);
for(let n=0;n<8;n++)feedback.sound('gun',0,0);feedback.sound('metal-hit',1,2);assert.equal(feedback.sounds.length,8);assert.ok(feedback.sounds.some(c=>c.kind==='metal-hit'));
const memory=feedback.memoryBytes();for(let n=0;n<10000;n++)feedback.effects.add(0,0,2,6,0,0,1,2,0);assert.equal(feedback.effects.count,B.LIMITS.effects);assert.equal(feedback.memoryBytes(),memory);feedback.effects.step(3);assert.equal(feedback.effects.count,0);
console.log('PASS bounded physical hit response, directional strikes, drifting wreck state and prioritized impact sound');
