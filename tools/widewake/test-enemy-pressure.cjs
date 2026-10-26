/* Attack pressure, committed passes and recovery against actual friendly hulls. */
const assert=require('node:assert/strict'),B=require('../../js/widewake-battle-core.js');
require('../../js/widewake-estuary-core.js');const R=require('../../js/widewake-reach-game.js');
const dt=1/60,rand=B.random(91),reports=[];
function fixture(){const b=new B.Battle({population:0});b.mounts=[];b.ships.slice(1).forEach(s=>s.hp=0);Object.assign(b.player,{x:700,px:700,y:0,py:0,vx:0,vy:0,length:6,width:2.3});b.sea=null;b.contacts={active:true};return b;}
function step(b,n=1){for(let k=0;k<n;k++){b.tick++;b.time+=dt;b.raiders.index();b.raiders.step(dt,b);}}
for(const kind of [0,1,2]){
  const b=fixture(),a=b.raiders;a.add(0,0,kind,rand);let minimum=Infinity,maximum=0,samples=0,minDrive=Infinity;
  for(let k=0;k<1500;k++){step(b);const d=Math.hypot(b.player.x-a.x[0],b.player.y-a.y[0]);if(d<240&&d>80){const speed=Math.hypot(a.vx[0],a.vy[0]);minimum=Math.min(minimum,speed);maximum=Math.max(maximum,speed);minDrive=Math.min(minDrive,a.drive[0]);samples++;}if(d<80)break;}
  const cruise=kind===1?66:kind===2?39:49;assert.ok(samples>20,'cross the near approach band');assert.ok(minDrive>cruise*.98,'no proximity throttle reduction');assert.ok(minimum>cruise*.86,JSON.stringify({kind,minimum,cruise}));reports.push({kind,nearMinimum:+minimum.toFixed(2),nearMaximum:+maximum.toFixed(2),minDrive:+minDrive.toFixed(2),samples});
}
console.log('PASS skiffs, flankers and gunners keep propulsion through near approach bands');

const gunner=fixture(),a=gunner.raiders;a.add(0,0,2,rand);let minRange=Infinity,maxRange=0,passes=0,lastPhase=0,shots=0;
for(let k=0;k<4800;k++){step(gunner);const phase=a.attackPhase[0],d=Math.hypot(gunner.player.x-a.x[0],gunner.player.y-a.y[0]);if(phase&&!lastPhase)passes++;lastPhase=phase;if(k>600){minRange=Math.min(minRange,d);maxRange=Math.max(maxRange,d);}shots=gunner.shots.count;}
assert.ok(passes>=3,JSON.stringify({passes,minRange,maxRange}));assert.ok(minRange<130&&maxRange>320,'gunners close and leave rather than park at330m');assert.ok(shots>=6,'gunners keep firing across repeated passes');
reports.push({passes,minRange:+minRange.toFixed(2),maxRange:+maxRange.toFixed(2),shots});
console.log('PASS gunners make repeated committed attack passes, fire while closing and turn back to re-engage');

const turning=fixture(),h=turning.raiders;h.add(0,0,0,rand);h.steeringReady[0]=1;h.angle[0]=Math.PI;h.desiredAngle[0]=0;h.desiredSpeed[0]=h.drive[0]=49;h.vx[0]=-49;h.helm(0,dt);assert.equal(h.drive[0],49,'turning cannot automatically cut the engine');
turning.player.x=turning.player.y=0;h.x[0]=h.px[0]=h.y[0]=h.py[0]=0;const hp=h.hp[0];step(turning);assert.equal(h.hp[0],hp,'touch does not remove an attacking boat when physical contacts own the event');
console.log('PASS turning leaves the throttle committed and contact outcomes belong to the physical solver');

function physicalPasses(kind,moving,large,start){
  const b=new B.Battle({population:0}),s=large?b.player:new R.Game().player,a=b.raiders,cruise=kind===1?66:49;
  // Use the real starter launch and flagship hulls, including their mass and
  // water-momentum response. Observer durability permits repeated attack runs.
  Object.assign(s,{x:0,px:0,y:0,py:0,angle:0,previousAngle:0,speed:36,vx:moving?36:0,vy:0});
  if(!large)assert.deepEqual([s.length,s.width,s.draft],[6,2.3,.45]);
  b.ships=[s];b.mounts=[];b.sea=null;let damage=0;b.hurt=(ship,n)=>damage+=n;b.damage=()=>{};
  a.add(start??Math.max(35,s.length*.5+22),0,kind,B.random(1));a.steeringReady[0]=1;a.angle[0]=a.previousAngle[0]=Math.PI/2;a.forwardX[0]=0;a.forwardY[0]=1;a.vx[0]=0;a.vy[0]=cruise;a.drive[0]=a.desiredSpeed[0]=cruise;
  let phase=0,passes=0,episodes=0,lastContact=-10,firstContact=Infinity,minimum=Infinity,maximum=0,minDrive=Infinity,streak=0,longestContact=0;
  for(let k=0;k<5400;k++){
    b.tick++;b.time+=dt;s.px=s.x;s.py=s.y;s.previousAngle=s.angle;B.helmStep(s,{x:moving?1:0,y:0},dt);
    a.index();a.step(dt,b);a.index();b.contacts.solve(b,dt);
    const d=Math.hypot(s.x-a.x[0],s.y-a.y[0]);minimum=Math.min(minimum,d);maximum=Math.max(maximum,d);minDrive=Math.min(minDrive,a.drive[0]);
    if(a.attackPhase[0]&&!phase)passes++;phase=a.attackPhase[0];
    streak=b.contacts.lastContacts?streak+1:0;longestContact=Math.max(longestContact,streak);
    if(b.contacts.lastContacts){firstContact=Math.min(firstContact,b.time);if(b.time-lastContact>.5)episodes++;lastContact=b.time;}
  }
  const result={kind,moving,hull:large?'flagship':'starter',passes,episodes,firstContact:+firstContact.toFixed(2),minimum:+minimum.toFixed(2),maximum:+maximum.toFixed(2),longestContact,minDrive:+minDrive.toFixed(2),damage:+damage.toFixed(2)};
  assert.ok(passes>=4&&episodes>=3,JSON.stringify(result));assert.ok(firstContact<35,JSON.stringify(result));
  assert.ok(maximum>200&&longestContact<120,'clear hull contact and establish another approach: '+JSON.stringify(result));
  assert.ok(minDrive>=cruise*.98,'no throttle reduction for turn, pass or proximity: '+JSON.stringify(result));
  if(!large)assert.ok(minimum<8,'repeat attacks reach the real launch hull: '+JSON.stringify(result));
  if(!moving)assert.ok(damage>20,'stationary hull receives real collision-energy attacks: '+JSON.stringify(result));
  return result;
}
for(const large of [false,true])for(const moving of [false,true])for(const kind of [0,1])reports.push(physicalPasses(kind,moving,large));
for(const start of [20,60])for(const kind of [0,1])physicalPasses(kind,false,false,start);
console.log('PASS skiffs and flankers break tangent circles around the 6 m launch, attack moving hulls, clear contact and reacquire across repeated runs');

const reused=new B.Raiders(4);for(let i=0;i<3;i++)reused.add(i*20,0,2,rand);reused.attackPhase[2]=1;reused.passX[2]=.6;reused.passY[2]=.8;reused.hp[0]=0;reused.compact();assert.equal(reused.attackPhase[0],1);assert.ok(Math.abs(reused.passX[0]-.6)<1e-6&&Math.abs(reused.passY[0]-.8)<1e-6);
const stress=fixture();for(let i=0;i<16384;i++){const angle=i*2.39996,r=700+i%2000;stress.raiders.add(Math.cos(angle)*r,Math.sin(angle)*r,i%3,rand);}const bytes=stress.memoryBytes();for(let k=0;k<90;k++)step(stress);assert.equal(stress.memoryBytes(),bytes);for(const key of ['x','y','vx','vy','angle','drive','passX','passY'])for(const n of stress.raiders[key])assert.ok(Number.isFinite(n),key+' stays finite');assert.ok(stress.raiders.avoidChecks<=16384*20&&stress.raiders.contactChecks<=16384*16);
console.log('PASS pass state survives slot reuse and 16,384 attackers retain finite fixed storage and bounded local work');console.log(JSON.stringify({reports,bufferBytes:bytes}));
