/* Physical motion, persistent wake bounds, automatic weapons and old saves. */
const assert=require('node:assert/strict');
const B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js'),R=require('../../js/widewake-reach-game.js');require('../../js/widewake-ocean-art.js');
const dt=1/60,boat=(type='launch',cargo=0)=>({...E.vessels[type]||B.roles[type],id:0,type,x:0,y:2000,vx:0,vy:0,angle:0,turn:0,hp:100,hold:32,cargo});
const advance=(s,input,seconds)=>{for(let i=0;i<seconds/dt;i++)B.helmStep(s,input,dt);};
const report=[];
for(const type of ['launch','gunboat','flagship','oilrig']){
  const s=boat(type);advance(s,{x:1,y:0},15);assert.ok(Math.abs(s.vx-s.speed)<.001);
  const coast={...s},brake={...s},x=s.x;advance(coast,{},2);advance(brake,{reverse:true},2);
  assert.ok(coast.vx>0&&coast.x>x,'neutral retains forward momentum');assert.ok(brake.vx<coast.vx&&brake.x<coast.x,'reverse propeller arrests forward motion sooner');
  B.helmStep(s,{x:0,y:1},dt);const heading=Math.atan2(s.vy,s.vx);assert.ok(s.angle>0&&heading<s.angle*.25,'turning the hull cannot rotate the world velocity with it');
  advance(s,{x:0,y:1},.5);const slip=s.vy*Math.cos(s.angle)-s.vx*Math.sin(s.angle);assert.ok(Math.abs(slip)>.1,'a turning hull leaves measurable sideslip');
  const empty=boat(type),laden=boat(type,32);advance(empty,{x:1,y:0},.5);advance(laden,{x:1,y:0},.5);assert.ok(laden.vx<empty.vx*.95,'cargo adds inertia');
  for(const input of [{x:1,y:1},{x:.25,y:0},{x:1,y:0,boost:true}]){const b=boat(type);advance(b,input,15);const expected=b.speed*Math.min(1,Math.hypot(input.x,input.y))*(input.boost?1.35:1);assert.ok(Math.abs(Math.hypot(b.vx,b.vy)-expected)<.02,'analog and diagonal inputs have honest speed');}
  report.push({type,coastMetres:coast.x-x,reverseMetres:brake.x-x,sideSlip:slip});
}
// The integrator converges across supported simulation steps.
const a=boat(),b=boat();for(let i=0;i<600;i++)B.helmStep(a,{x:Math.cos(i/600*2),y:Math.sin(i/600*2)},1/60);for(let i=0;i<300;i++)B.helmStep(b,{x:Math.cos(i/300*2),y:Math.sin(i/300*2)},1/30);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1);
console.log('PASS world momentum, surge/sway/yaw, coasting, reverse thrust, cargo and timestep convergence');

const wake=new WidewakeOceanArt.WakeTrail(),s=boat(),poses=[s],v={battle:{ships:[s]},poses,zoom:2,baseScale:1,visualTime:0,visible:()=>true};const buffers=wake.tracks.map(t=>t.x);
for(let i=0;i<3600;i++){const angle=i/60*.3;B.helmStep(s,{x:Math.cos(angle),y:Math.sin(angle)},dt);v.visualTime=i/60;wake.sample([s],poses,v.visualTime);}
assert.ok(wake.count>80&&wake.count<=128);assert.equal(wake.bytes,61440);assert.ok(wake.tracks.every((t,i)=>t.x===buffers[i]));
let segments=0;wake.segments(v,(...p)=>{assert.ok(p.every(Number.isFinite));segments++;});assert.ok(segments>70&&segments<=130);
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
