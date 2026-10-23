/* Excess helm costs control and speed; forces still dissipate and converge. */
const assert=require('node:assert/strict'),B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js'),R=require('../../js/widewake-reach-game.js'),W=require('../../js/widewake-waves.js');
const make=(type='launch',cargo=0)=>({...E.vessels[type]||B.roles[type],speed:R.hulls[type].speed,id:0,type,x:0,y:2500,vx:R.hulls[type].speed,vy:0,angle:0,turn:0,throttle:1,hp:100,hold:32,cargo});
function advance(s,input,seconds,dt=1/60){let angle=0,previous=s.angle,maxSlip=0,minSpeed=Infinity;for(let n=0;n<Math.round(seconds/dt);n++){
  B.helmStep(s,input,dt);angle+=B.angleDelta(s.angle,previous);previous=s.angle;const speed=Math.hypot(s.vx,s.vy);
  minSpeed=Math.min(minSpeed,speed);if(speed>s.speed*.15)maxSlip=Math.max(maxSlip,Math.abs(B.angleDelta(s.angle,Math.atan2(s.vy,s.vx))));
  for(const key of ['x','y','angle','turn','vx','vy','helmLateralAccel'])assert.ok(Number.isFinite(s[key]),key);
}return{angle,maxSlip,minSpeed,speed:Math.hypot(s.vx,s.vy)};}
const reports=[];
for(const type of ['launch','gunboat','flagship'])for(const direction of [-1,1]){
  const scale=Math.max(.7,Math.min(1.4,Math.sqrt(18/make(type).length))),duration=2.1/scale;
  const hard=make(type),gentle=make(type),empty=make(type),laden=make(type,32);
  const lost=advance(hard,{throttle:1,steer:direction},duration),carve=advance(gentle,{throttle:1,steer:direction*.3},duration);
  assert.ok(lost.maxSlip>Math.PI/2,'held hard helm can rotate the bow past the travel direction');
  assert.ok(lost.minSpeed<hard.speed*.45,'the spinout must scrub a substantial amount of speed');
  assert.ok(carve.maxSlip<.3&&carve.speed>gentle.speed*.9,'measured helm still produces an efficient controlled turn');
  assert.ok(lost.angle*direction>Math.PI*.8,'rotation continues beyond a safe corner');
  advance(empty,{throttle:1,steer:direction},.5);advance(laden,{throttle:1,steer:direction},.5);
  assert.ok(Math.abs(laden.turn)<Math.abs(empty.turn)*.92,'cargo slows angular acceleration');
  // Start recovery before the full spin. Opposite helm cannot instantly cancel
  // rotation, and continuing to hold it can overcommit in the other direction.
  const recovery=make(type);advance(recovery,{throttle:1,steer:direction},.8);
  const turn=recovery.turn;B.helmStep(recovery,{throttle:1,steer:-direction},1/60);
  assert.ok(recovery.turn*turn>0&&Math.abs(recovery.turn)>Math.abs(turn)*.8);
  advance(recovery,{throttle:1,steer:-direction},type==='launch'?.3-1/60:.6-1/60);
  assert.ok(recovery.turn*direction<0);advance(recovery,{throttle:1,steer:0},5);
  assert.ok(Math.hypot(recovery.vx,recovery.vy)>recovery.speed*.9&&Math.abs(recovery.turn)<.04,'deliberate correction restores control without a reset');
  const excess=make(type);advance(excess,{throttle:1,steer:direction},.8);const opposite=advance(excess,{throttle:1,steer:-direction},duration+1);
  assert.ok(opposite.angle*direction< -1.5,'holding the correction too long also over-rotates');
  if(direction===1)reports.push({type,hard:lost,gentle:carve,recoverySpeed:Math.hypot(recovery.vx,recovery.vy)});
}
// Unpowered resistance must remove kinetic energy, including external yaw and
// sideways impulses. Merely centering the helm supplies no restoring torque.
for(const cargo of [0,32]){const s=make('launch',cargo);Object.assign(s,{throttle:0,vx:17,vy:24,turn:3});let energy=s.vx*s.vx+s.vy*s.vy+s.turn*s.turn;
  for(let n=0;n<600;n++){B.helmStep(s,{throttle:0,steer:0},1/60);const next=s.vx*s.vx+s.vy*s.vy+s.turn*s.turn;assert.ok(next<=energy+1e-9,'passive water forces cannot add energy');energy=next;}
}
const run=dt=>{const s=make();for(const [seconds,input]of [[.8,{throttle:1,steer:1}],[.3,{throttle:1,steer:-1}],[2,{throttle:1,steer:0}],[1,{throttle:-1,steer:0}]])advance(s,input,seconds,dt);return s;};
const fine=run(1/120);for(const dt of [1/60,1/30]){const s=run(dt);assert.ok(Math.hypot(s.x-fine.x,s.y-fine.y)<1e-7&&Math.abs(B.angleDelta(s.angle,fine.angle))<1e-8,'fixed force integration converges through a spin and recovery');}
const dry=make();Object.assign(dry,{turn:1,sea:{airborne:true,contact:0}});const coast=structuredClone(dry);advance(dry,{throttle:1,steer:1},1);advance(coast,{throttle:-1,steer:-1},1);assert.deepEqual(dry,coast,'a dry hull cannot steer or brake itself out of flight');
const flat=new W.Sea();flat.strength=0;const s=make();let peakRoll=0;for(let n=0;n<240;n++){flat.begin(n/60);B.helmStep(s,{throttle:1,steer:n<90?1:0},1/60);flat.stepShip(s,1/60);peakRoll=Math.max(peakRoll,Math.abs(s.sea.roll));assert.ok(Math.hypot(s.sea.roll,s.sea.pitch)<.481);}
assert.ok(peakRoll>.05,'actual lateral water force visibly banks the hull');
assert.equal(s.helmLateralAccel,undefined,'buoyancy consumes the transient helm force before a later mooring update');
console.log('PASS sustained oversteer, gentle carving, cargo, recovery, overcorrection, passive energy loss, timestep convergence, dry controls and force-driven banking',JSON.stringify({reports,peakRoll},null,2));
