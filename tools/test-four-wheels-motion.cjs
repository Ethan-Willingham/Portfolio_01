const assert=require('node:assert/strict');
const {createMotionInterpolator}=require('../js/four-wheels-view.js');
const Terrain=require('../js/four-wheels-terrain.js');
const Physics=require('../js/four-wheels-physics.js'),Course=require('../js/four-wheels-course.js');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

for(const hz of [60,90,120,144,165]){
  const w={body:{x:0,y:0,z:0,a:0,pitch:0,rollTilt:0},wheels:Array.from({length:4},()=>({a:0,roll:0})),gait:{phase:0,stride:1},shopper:{x:-16,y:0,z:18}};
  const motion=createMotionInterpolator();motion.capture(w);let accumulator=0,lastX;
  for(let frame=1;frame<=hz*2;frame++){
    accumulator+=1/hz;
    while(accumulator>=1/120){motion.capture(w);w.body.x+=1;w.shopper.x+=1;accumulator-=1/120;}
    const before=JSON.stringify(w),pose=motion.sample(w,accumulator*120);assert.equal(JSON.stringify(w),before,'render interpolation cannot change simulation or save state');
    if(frame>2){near(pose.body.x,120*frame/hz-1);near(pose.body.x-lastX,120/hz);}
    lastX=pose.body.x;
  }
  console.log('PASS evenly spaced visual motion at '+hz+' Hz');
}
const w=new Physics.World(Course.build()),motion=createMotionInterpolator();
w.body.a=Math.PI-.04;w.gait.phase=Math.PI*2-.04;motion.capture(w);w.body.a=-Math.PI+.04;w.gait.phase=.04;
let pose=motion.sample(w,.5);near(pose.body.a,Math.PI);near(pose.gait.phase,Math.PI*2);
motion.capture(w);w.body.qw=-w.body.qw;w.body.qx=-w.body.qx;w.body.qy=-w.body.qy;w.body.qz=-w.body.qz;pose=motion.sample(w,.5);
near(Math.hypot(pose.body.qw,pose.body.qx,pose.body.qy,pose.body.qz),1);
w.body.x+=300;assert.equal(motion.sample(w,.1),w,'a fall recovery shows its destination immediately');
console.log('PASS angle wrapping, quaternion continuity and fall recovery');

w.ragdoll={nodes:Array.from({length:15},(_,i)=>({x:i,y:0,z:50+i})),time:0};motion.capture(w);
w.ragdoll.nodes.forEach(n=>{n.x+=4;n.z-=2;});
const saved=JSON.stringify(Course.snapshot(w));pose=motion.sample(w,.25);
pose.ragdoll.nodes.forEach((n,i)=>{near(n.x,i+1);near(n.z,49.5+i);});
assert.equal(JSON.stringify(Course.snapshot(w)),saved,'joint interpolation cannot alter a saved tumble');
w.ragdoll=null;assert.equal(motion.sample(w,.25).ragdoll,null,'recovery clears the interpolated ragdoll');
console.log('PASS falling joints interpolate without altering simulation or recovery');


for(let i=0;i<100;i++){
  const b={x:i,y:-i,z:i/3,a:i*.21,pitch:i*.14,rollTilt:i*.19,comX:10,comHeight:16};
  for(const p of [[-6,-12,30],[31,11,31],[21,-12,0],[0,0,0]])assert.deepEqual(Terrain.position(b,...p),Terrain.kinematics(b,...p).p);
  b.a+=.3;b.pitch+=.2;b.x+=2;b.z-=1;
  assert.deepEqual(Terrain.position(b,3,7,4),Terrain.kinematics(b,3,7,4).p,'pose cache invalidates after position or attitude changes');
}
console.log('PASS rendering positions exactly match physics contact positions');

const rect=w.level.walls[0],original=w.floorAt.bind(w);let calls=0;
w.floorAt=(...args)=>{calls++;return original(...args);};
for(let i=0;i<100;i++)w.wallOverlaps(rect,10,7);
assert.equal(calls,1,'immutable wall elevation is sampled once across contact passes');
rect.x+=2;w.wallOverlaps(rect,10,7);assert.equal(calls,2,'moving geometry invalidates the wall elevation');
w.wallOverlaps({bottom:80,top:122,x:947,y:235,w:6,h:110},85,7);assert.equal(calls,2,'moving shutter bounds do not resample the floor');
console.log('PASS wall elevation reuse and moving geometry invalidation');
