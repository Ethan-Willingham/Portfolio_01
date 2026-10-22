const assert=require('node:assert/strict');
const W=require('../../js/widewake-waves.js'),B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js'),R=require('../../js/widewake-reach-game.js');
const dt=1/60;
// Analytic gradients and surface velocity agree with finite differences.
for(let n=0;n<50;n++){const x=n*7.13,y=n*-11.6,t=n*.31,q=W.sample(x,y,t),e=.0001;assert.ok(Math.abs((W.sample(x+e,y,t).height-W.sample(x-e,y,t).height)/(2*e)-q.dx)<1e-6);assert.ok(Math.abs((W.sample(x,y+e,t).height-W.sample(x,y-e,t).height)/(2*e)-q.dy)<1e-6);assert.ok(Math.abs((W.sample(x,y,t+e).height-W.sample(x,y,t-e).height)/(2*e)-q.vz)<1e-6);}
const field=new E.Field(),sea=new W.Sea(field);let sheltered=0,open=0;for(let n=0;n<300;n++){sheltered+=sea.at(-550,600,n*.1).height**2;open+=sea.at(0,2200,n*.1).height**2;}assert.ok(open>sheltered*20);assert.equal(W.sample(0,0,1,-1).height,0);console.log('PASS coherent derivatives, dry land and sheltered water');
const boat=(spec,id=0)=>({...spec,id,x:100,y:2200,px:100,py:2200,angle:0,vx:0,vy:0,hp:100,hold:32,cargo:0});
const extremes=[];
for(const spec of [E.vessels.launch,B.roles.gunboat,B.roles.oilrig,B.roles.flagship]){
  const s=boat(spec),o=new W.Sea();let low=Infinity,high=-Infinity,maxRoll=0;
  for(let n=1;n<7200;n++){o.begin(n*dt);B.helmStep(s,{throttle:n<3600?.7:0,steer:Math.sin(n*.003)*.3},dt);o.stepShip(s,dt);low=Math.min(low,s.sea.z);high=Math.max(high,s.sea.z);maxRoll=Math.max(maxRoll,Math.abs(s.sea.roll));for(const key of ['x','y','vx','vy','angle'])assert.ok(Number.isFinite(s[key]));assert.ok(Math.abs(s.sea.z)<4&&Math.abs(s.sea.roll)<.35&&Math.abs(s.sea.pitch)<.3);}
  assert.ok(high-low>.2);extremes.push({length:s.length,heave:high-low,maxRoll});assert.ok(o.count<=W.CAPACITY);assert.ok(o.bytes<26000);
}
assert.ok(extremes[0].maxRoll>extremes[3].maxRoll*1.2);console.log('PASS sustained hull stability, smaller hull response and fixed wake storage',extremes);
const flat=new W.Sea();flat.strength=0;const a=boat(E.vessels.launch),b=boat(E.vessels.launch);for(let n=1;n<600;n++){flat.begin(n*dt);B.helmStep(a,{throttle:1,steer:.3},dt);B.helmStep(b,{throttle:1,steer:.3},dt);flat.stepShip(a,dt);}assert.equal(a.x,b.x);assert.equal(a.y,b.y);assert.equal(a.sea.z,0);
const wake=new W.Sea(),emitter=boat(B.roles.gunboat,1);emitter.vx=20;wake.begin(1);wake.emit(emitter);const i=0,t=2,r=wake.wake[i+4]+3.5,x=wake.wake[0]-r,y=wake.wake[1];const crossed=wake.at(x,y,t,{},0),own=wake.at(x,y,t,{},1);assert.ok(crossed.height-own.height>.1);assert.deepEqual(wake.at(x,y,20,{},0),wake.at(x,y,20,{},1));console.log('PASS flat-water control, physical crossing wakes and expiration');
const g=new R.Game();assert.equal(g.player.speed,36);g.coins=10000;g.rank=4;g.earned.push('salt','fish','oil');g.changeHull('gunboat');assert.equal(g.player.speed,72);console.log('PASS faster campaign hulls');
