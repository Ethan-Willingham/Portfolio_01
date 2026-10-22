/* Distributed water contact: no takeoff impulses, hull exemptions or fixed arcs. */
const assert=require('node:assert/strict');
const W=require('../../js/widewake-waves.js'),B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js'),R=require('../../js/widewake-reach-game.js');
const make=(scale=1,load=0)=>({...E.vessels.launch,id:0,length:6*scale,width:2.3*scale,draft:.45*scale,speed:36,x:0,y:2400,angle:0,vx:0,vy:0,hp:100,hold:32,cargo:load*32});
const flat=()=>{const sea=new W.Sea();sea.at=(x,y,t,out={})=>Object.assign(out,{height:0,dx:0,dy:0,vz:0,vx:0,vy:0,exposure:1});return sea;};
// A dry hull follows gravity and carries its angular momentum even when its
// vertical velocity is already negative. No airborne pose or velocity is imposed.
const falling=make();falling.sea={z:4,pitch:.12,roll:-.04,vz:-1.7,vp:.23,vr:-.11,x:0,y:2400,airborne:true,contact:0,jumpAt:0,landAt:-100,landCount:0};
const dry=flat(),before={...falling.sea};dry.begin(.1);dry.stepShip(falling,.1,false);
assert.ok(Math.abs(falling.sea.vz-(before.vz-9.81*.1))<1e-10);
assert.ok(Math.abs(falling.sea.z-(before.z+before.vz*.1-9.81*.1*.1/2))<1e-10);
assert.ok(falling.sea.pitch>before.pitch&&falling.sea.roll<before.roll,'dry hull keeps the direction of both angular velocities');
assert.equal(falling.sea.contact,0);
// Flat water dissipates a drop, rather than resetting the hull to the surface.
let initialImpact=null;
for(let n=1;n<1800;n++){dry.begin(.1+n/120);const was=falling.sea.airborne;dry.stepShip(falling,1/120,false);if(was&&!falling.sea.airborne&&!initialImpact)initialImpact={...falling.sea};}
assert.ok(initialImpact&&initialImpact.vz<0,'first contact preserves downward momentum while pressure catches the hull');
assert.ok(Math.abs(falling.sea.z)<.002&&Math.abs(falling.sea.vz)<.002,'hydrostatic support settles to rest');
// The same shaped wave and hull obey dimensional scaling. Double all lengths,
// scale speed/time by sqrt(2), and the normalized rigid-body path must agree.
function hump({scale=1,speed=23,load=0,dt=1/240}={}){
  const sea=new W.Sea(),s=make(scale,load),clock=Math.sqrt(scale),step=dt*clock,trace=[],flights=[];let event;
  sea.at=(x,y,t,out={})=>{const u=x/scale/11,v=y/scale/6,h=1.7*Math.exp(-u*u),cross=1+.18*Math.sin(v);return Object.assign(out,{height:scale*h*cross,dx:-2*u/11*h*cross,dy:h*.18*Math.cos(v)/6,vz:0,vx:0,vy:0,exposure:1});};
  s.y=0;s.vx=speed*clock;
  for(let n=0;n<Math.round(7/dt);n++){
    const was=s.sea?.airborne;s.x=-48*scale+s.vx*n*step;sea.begin(n*step);sea.stepShip(s,step,false);
    const q=s.sea;if(q.airborne&&!was){event={t:n*step,vz:q.vz,pitch:q.pitch};flights.push(event);}if(!q.airborne&&was&&event){event.duration=n*step-event.t;event=null;}
    trace.push([q.z/scale,q.vz/clock,q.pitch,q.roll,q.contact]);
  }
  return{trace,flights,ship:s};
}
const reference=hump();assert.ok(reference.flights.length>0,'a steep face can naturally shed support');
for(const scale of [2,4,8]){
  const result=hump({scale});let error=0;for(let n=0;n<result.trace.length;n++)for(let k=0;k<5;k++)error=Math.max(error,Math.abs(result.trace[n][k]-reference.trace[n][k]));
  assert.ok(error<.002,'scaled hulls share one physical law: '+JSON.stringify({scale,error}));assert.equal(result.flights.length,reference.flights.length);
}
assert.equal(hump({speed:5}).flights.length,0,'a slow crossing need not leave the water');
// Consecutive real-wave encounters, speed, heading and cargo determine the
// measured takeoff velocities, attitudes and airtimes. No random jump variance.
function voyage({speed=36,heading=0,load=0,shelter=false,dt=1/60}={}){
  const sea=new W.Sea(shelter?{sample:(x,y,out={})=>Object.assign(out,{depth:9,salinity:.77})}:null),s=make(1,load),events=[];let event,maxGap=0,maxZ=0,gravityError=0;
  Object.assign(s,{y:shelter?600:2400,angle:heading,vx:Math.cos(heading)*speed,vy:Math.sin(heading)*speed});
  for(let n=0;n<60/dt;n++){
    const previous=s.sea&&{...s.sea};sea.begin(n*dt);B.helmStep(s,{throttle:speed/s.speed,steer:0},dt);sea.stepShip(s,dt);const q=s.sea;
    if(q.airborne&&!previous?.airborne){event={t:n*dt,vz:q.vz,pitch:q.pitch,roll:q.roll};events.push(event);}
    if(q.airborne&&previous?.airborne)gravityError=Math.max(gravityError,Math.abs(q.vz-previous.vz+9.81*dt));
    if(!q.airborne&&previous?.airborne&&event){event.duration=n*dt-event.t;event.impact=q.impact;event=null;}
    assert.ok(Number.isFinite(q.z)&&Math.abs(q.z)<15&&Math.hypot(q.pitch,q.roll)<.481);assert.ok(q.contact>=0&&q.contact<=1);
    maxGap=Math.max(maxGap,q.z-q.surface);maxZ=Math.max(maxZ,q.z);
  }
  return{events:events.filter(e=>e.duration),maxGap,maxZ,gravityError};
}
const spread=(list,key)=>Math.max(...list.map(e=>e[key]))-Math.min(...list.map(e=>e[key]));
const open=voyage(),loaded=voyage({load:1}),coarse=voyage({dt:1/30}),following=voyage({heading:W.bands[0].angle});
assert.ok(open.events.length>=6&&open.maxGap>1);
assert.ok(spread(open.events,'vz')>1&&spread(open.events,'pitch')>.04&&spread(open.events,'duration')>.25,'successive waves produce distinct velocities, attitudes and airtimes');
assert.ok(open.gravityError<1e-8,'unsupported flights retain gravity');
assert.ok(Math.abs(coarse.events.length-open.events.length)<=3&&Math.abs(coarse.maxGap-open.maxGap)<1.5,'contact integration converges across frame steps');
assert.ok(Math.abs(open.maxZ-loaded.maxZ)>.2,'cargo changes displacement and subsequent flight');
assert.ok(following.events.length<open.events.length,'following seas produce a different contact response');
assert.equal(voyage({speed:12}).events.length,0);assert.equal(voyage({shelter:true}).events.length,0);
const air={...make(),vx:36,turn:.4,sea:{airborne:true}};B.helmStep(air,{throttle:-1,steer:-1},.1);assert.ok(air.vx>35.5&&Math.abs(air.vy)<1e-6&&air.turn>.39,'dry helm cannot brake or countersteer');
// Dormant test snapshots retain continuous contact and momentum exactly.
const g=new R.Game();g.castOff();Object.assign(g.player,{x:0,y:2400,px:0,py:2400,vx:36,vy:0,angle:0});g.nextEncounter=1e9;g.mounts=[];
for(let n=0;n<900&&!g.player.sea?.airborne;n++)g.step(1/60,{throttle:1,steer:0});assert.ok(g.player.sea.airborne);
const again=R.Game.restore(g.save());assert.deepEqual(again.player.sea,g.player.sea);
for(let n=0;n<180;n++){g.step(1/60,{throttle:1,steer:0});again.step(1/60,{throttle:1,steer:0});assert.deepEqual(again.player.sea,g.player.sea);assert.equal(again.player.x,g.player.x);}
console.log('PASS gravity, carried rotation, dissipative water contact, dimensional hull scaling, speed/load/heading response, varied flights and deterministic continuation');
console.log(JSON.stringify({open:open.events.slice(0,8),loadedMaxZ:loaded.maxZ,coarseEvents:coarse.events.length,followingEvents:following.events.length},null,2));
