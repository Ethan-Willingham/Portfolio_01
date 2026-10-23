/* Physical motion, persistent wake bounds, automatic weapons and old saves. */
const assert=require('node:assert/strict');
const B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js'),R=require('../../js/widewake-reach-game.js');require('../../js/widewake-ocean-art.js');
const dt=1/60,boat=(type='launch',cargo=0)=>({...E.vessels[type]||B.roles[type],id:0,type,x:0,y:2000,vx:0,vy:0,angle:0,turn:0,hp:100,hold:32,cargo});
const advance=(s,input,seconds)=>{for(let i=0;i<seconds/dt;i++)B.helmStep(s,input,dt);};
const report=[];
for(const type of ['launch','gunboat','flagship','oilrig']){
  const s=boat(type);advance(s,{x:1,y:0},15);assert.ok(Math.abs(s.vx-s.speed)<.001);
  const coast={...s},brake={...s},x=s.x;advance(coast,{},2);advance(brake,{reverse:true},2);
  assert.ok(coast.vx>0&&coast.x>x,'neutral retains forward momentum');assert.deepEqual(brake,coast,'retired reverse input has no effect on coasting');
  B.helmStep(s,{x:0,y:1},dt);const heading=Math.atan2(s.vy,s.vx);assert.ok(s.angle>0&&heading<s.angle*.25,'turning the hull cannot rotate the world velocity with it');
  advance(s,{x:0,y:1},.5);const slip=s.vy*Math.cos(s.angle)-s.vx*Math.sin(s.angle);assert.ok(Math.abs(slip)>.1,'a turning hull leaves measurable sideslip');
  const empty=boat(type),laden=boat(type,32);advance(empty,{x:1,y:0},.5);advance(laden,{x:1,y:0},.5);assert.ok(laden.vx<empty.vx*.95,'cargo adds inertia');
  for(const input of [{x:1,y:1},{x:.25,y:0},{x:1,y:0,boost:true}]){const b=boat(type);advance(b,input,15);const expected=b.speed*Math.min(1,Math.hypot(input.x,input.y))*(input.boost?1.35:1);assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-expected)<.02,'analog and diagonal inputs have honest speed');}
  report.push({type,coastMetres:coast.x-x,sideSlip:slip});
}
// The integrator converges across supported simulation steps.
const a=boat(),b=boat();for(let i=0;i<600;i++)B.helmStep(a,{x:Math.cos(i/600*2),y:Math.sin(i/600*2)},1/60);for(let i=0;i<300;i++)B.helmStep(b,{x:Math.cos(i/300*2),y:Math.sin(i/300*2)},1/30);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1);
console.log('PASS world momentum, surge/sway/yaw, coasting, ignored reverse input, cargo and timestep convergence');

// Player helm is boat-relative at every heading, including when the bow
// points down the screen. Navigation vectors above remain a separate API.
for(const type of ['launch','gunboat','flagship'])for(let n=0;n<8;n++){
  const angle=n*Math.PI/4,s={...boat(type),angle},start={x:s.x,y:s.y};
  advance(s,{throttle:1,steer:0},2);
  const dx=s.x-start.x,dy=s.y-start.y;
  assert.ok(dx*Math.cos(angle)+dy*Math.sin(angle)>s.speed*.8);
  assert.ok(Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle))<.00001);
  assert.ok(Math.abs(B.angleDelta(s.angle,angle))<.00001);
  const left={...s},right={...s};advance(left,{throttle:1,steer:-1},.5);advance(right,{throttle:1,steer:1},.5);
  assert.ok(B.angleDelta(left.angle,angle)<-.2&&B.angleDelta(right.angle,angle)>.2);
  assert.ok(Math.abs(right.vy*Math.cos(right.angle)-right.vx*Math.sin(right.angle))>.4,'turns keep sideways momentum');
  const coast={...s},brake={...s};advance(coast,{throttle:0,steer:0},1);advance(brake,{throttle:-1,steer:0},1.5);
  assert.ok(Math.hypot(coast.vx,coast.vy)>1);assert.ok(brake.vx*Math.cos(angle)+brake.vy*Math.sin(angle)>=0&&Math.hypot(brake.vx,brake.vy)<1,'down brakes without reverse thrust');
}
const pivot=boat();advance(pivot,{throttle:0,steer:1},1);assert.equal(pivot.x,0);assert.equal(pivot.y,2000);assert.ok(pivot.angle>.5,'rudder turns without commanding forward thrust');
const empty=boat(),laden=boat('launch',32);advance(empty,{throttle:1,steer:.4},.5);advance(laden,{throttle:1,steer:.4},.5);assert.ok(Math.hypot(laden.vx,laden.vy)<Math.hypot(empty.vx,empty.vy));
const fine=boat(),coarse=boat();for(let i=0;i<360;i++)B.helmStep(fine,{throttle:1,steer:Math.sin(i/60)*.6},1/60);for(let i=0;i<180;i++)B.helmStep(coarse,{throttle:1,steer:Math.sin(i/30)*.6},1/30);assert.ok(Math.hypot(fine.x-coarse.x,fine.y-coarse.y)<.8);
const nav=new E.Navigation();assert.ok(nav.setCourse(nav.plan('reeds')));nav.step(dt,{throttle:0,steer:0});assert.ok(nav.route,'released helm preserves course');nav.step(dt,{throttle:0,steer:.5});assert.equal(nav.route,null,'turning takes the helm immediately');
console.log('PASS boat-relative throttle at eight headings, left/right rudder, jet turns, braking, cargo and route takeover');

// Releasing the rudder carries a useful arc instead of applying a hidden brake.
// Test actual campaign speeds and both directions, separately from wave forces.
const flow=[];
for(const type of ['launch','gunboat','flagship'])for(const direction of [-1,1]){
  const s={...boat(type),speed:R.hulls[type].speed};advance(s,{throttle:1,steer:0},6);advance(s,{throttle:1,steer:direction},.8);
  const heading=s.angle,yaw=s.turn,speed=Math.hypot(s.vx,s.vy),release={...s},coast={...s},counter={...s},brake={...s};
  B.helmStep(release,{throttle:1,steer:0},dt);assert.ok(release.turn*yaw>0&&Math.abs(release.turn)>Math.abs(yaw)*.9,'key release preserves angular momentum');
  advance(release,{throttle:1,steer:0},.75-dt);
  const carried=B.angleDelta(release.angle,heading)*direction,remaining=release.turn/yaw;
  assert.ok(carried>.45&&carried<1.1,'release carries a readable, bounded arc');
  assert.ok(remaining>.1&&remaining<.7,'yaw decays over several beats rather than stopping or spinning forever');
  assert.ok(Math.hypot(release.vx,release.vy)>speed*.9,'a powered carve keeps its speed');
  assert.ok(Math.abs(release.vy*Math.cos(release.angle)-release.vx*Math.sin(release.angle))>s.speed*.15,'momentum remains visibly sideways through the release');
  B.helmStep(counter,{throttle:1,steer:-direction},dt);assert.ok(counter.turn*yaw>0,'countersteering cannot snap angular velocity to the opposite sign');
  advance(counter,{throttle:1,steer:-direction},.3-dt);assert.ok(counter.turn*direction<-.2,'deliberate countersteering catches the arc promptly');
  advance(coast,{throttle:0,steer:0},.75);assert.ok(Math.hypot(coast.vx,coast.vy)>speed*.5,'lifting all controls carries forward momentum through the arc');
  advance(brake,{throttle:-1,steer:0},1.5);assert.ok(Math.hypot(brake.vx,brake.vy)<1.1,'braking still arrests a fast sideways carve');
  advance(release,{throttle:1,steer:0},10);assert.ok(Math.abs(release.turn)<.0001,'the carried turn eventually settles');
  if(direction===1)flow.push({type,releaseDegrees:carried*180/Math.PI,yawRemaining:remaining,coastSpeed:Math.hypot(coast.vx,coast.vy)});
}
const releaseRun=step=>{const s={...boat(),speed:R.hulls.launch.speed};for(const [seconds,input]of [[4,{throttle:1,steer:0}],[.8,{throttle:1,steer:1}],[.8,{throttle:1,steer:0}],[.4,{throttle:1,steer:-1}],[1,{throttle:0,steer:0}]])for(let i=0;i<Math.round(seconds/step);i++)B.helmStep(s,input,step);return s;};
const releaseFine=releaseRun(1/60),releaseCoarse=releaseRun(1/30);assert.ok(Math.hypot(releaseFine.x-releaseCoarse.x,releaseFine.y-releaseCoarse.y)<1.3,'release and countersteer paths converge across fixed timesteps');assert.ok(Math.abs(B.angleDelta(releaseFine.angle,releaseCoarse.angle))<.025);
console.log('PASS carried rudder release, powered carving, intentional countersteer, neutral slide, brake grip and release timestep convergence',flow);

const wake=new WidewakeOceanArt.WakeTrail(),s=boat(),poses=[s],v={battle:{ships:[s]},poses,zoom:2,baseScale:1,visualTime:0,visible:()=>true};const buffers=wake.tracks.map(t=>t.x);
for(let i=0;i<3600;i++){const angle=i/60*.3;B.helmStep(s,{x:Math.cos(angle),y:Math.sin(angle)},dt);v.visualTime=i/60;wake.sample([s],poses,v.visualTime);}
assert.ok(wake.count>80&&wake.count<=128);assert.equal(wake.bytes,110592);assert.ok(wake.tracks.every((t,i)=>t.x===buffers[i]));
let segments=0;wake.segments(v,(...p)=>{assert.ok(p.every(Number.isFinite));segments++;});assert.ok(segments>10&&segments<40);
const t=wake.tracks[0],last=(t.head+127)%128,point={x:t.x[last],y:t.y[last]};s.vx=s.vy=0;s.angle+=1;v.visualTime+=1;wake.sample([s],poses,v.visualTime);assert.equal(t.x[last],point.x);assert.equal(t.y[last],point.y);assert.ok(wake.count>50,'water keeps the wake when the boat stops');v.visualTime+=13;wake.sample([s],poses,v.visualTime);assert.equal(wake.count,0);
const fleet=Array.from({length:24},(_,id)=>({...boat(),id,vx:12,vy:0}));
for(let n=0;n<400;n++){const time=n*.1;fleet.forEach((s,i)=>{s.x=time*12;s.y=2000+i*12;});wake.sample(fleet,fleet,time);}
assert.ok(wake.count>2400&&wake.count<=3072);assert.ok(wake.tracks.every((t,i)=>t.x===buffers[i]));
console.log('PASS world-anchored wake survives turns and stops, ages out, and never grows its buffers');

const g=new R.Game();g.rank=4;g.coins=10000;assert.ok(g.changeHull('gunboat'));g.castOff();Object.assign(g.player,{x:0,y:2000,px:0,py:2000,angle:0,previousAngle:0});g.nextEncounter=Infinity;g.mounts=[];
// No input is supplied; enemies in a bank arc automatically release the salvo.
g.raiders.add(0,2240,2,B.random(4));g.raiders.index();for(let i=0;i<12;i++)g.step(dt);assert.ok(g.burstCooldown>0);assert.ok(g.shots.count>0);assert.ok(g.shots.owner.slice(0,g.shots.count).includes(0));
const quiet=new R.Game();quiet.rank=4;quiet.coins=10000;quiet.changeHull('gunboat');quiet.castOff();for(let i=0;i<600;i++)quiet.step(dt);assert.equal(quiet.burstCooldown,0,'empty water does not trigger bank salvos');
const launch=new R.Game();launch.castOff();Object.assign(launch.player,{x:0,y:2000,px:0,py:2000});launch.raiders.add(70,2020,0,B.random(9));launch.raiders.index();for(let i=0;i<120;i++)launch.step(dt);assert.ok(launch.kills>0,'starter guns fight without a fire action');
const saved=JSON.parse(launch.save());delete saved.ships[0].throttle;assert.ok(R.Game.restore(JSON.stringify(saved)),'older saves default engine spool safely');saved.ships[0].throttle=9;assert.throws(()=>R.Game.restore(JSON.stringify(saved)));
console.log('PASS automatic starter guns and bank salvos, quiet empty water, compatible validated engine saves');console.log(JSON.stringify(report,null,2));
