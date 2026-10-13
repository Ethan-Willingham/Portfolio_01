// Independent gas inventory, entrance momentum and vane angular momentum.
const assert=require('node:assert/strict');
const B=require('../js/water-machines-builder.js');
require('../js/wss-machines/breathing-cave.js');require('../js/wss-breathing-cave.js');
function setup(options={}){
  const walls=new Uint8Array(90*50);let version=0,closed=!!options.closed;
  const d=WSSMachines['breathing-cave'].make({w:720,h:400,tile:8},options);
  const b=B.create({width:90,height:50,tile:8,walls,onChange:()=>version++});
  d.vessels.forEach(v=>b.vessel(v.rect,v.sealed));d.pipes.forEach(p=>b.strokePipe(p.points,p.bore));
  const gate=d.cave.gate;
  const solidAt=(x,y)=>!!walls[Math.floor(y/8)*90+Math.floor(x/8)] || closed && x>=gate.x && x<gate.x+gate.width && y>=gate.y && y<gate.y+gate.height;
  const model=WSSBreathingCave.create(d,{w:720,h:400,tile:8,solidAt,version:()=>version});
  return {model,d,solidAt,close:value=>{closed=value;version++;}};
}
function run(s,seconds,dt=1/60){for(let t=0;t<seconds-1e-9;t+=dt)s.model.tick(dt);return s.model.stats();}
function pump(s,side,count=1){for(let i=0;i<count;i++)assert.equal(s.model.increasePressure(side),true);}
function healthy(a){
  assert.equal(a.error,null);assert.ok(a.massKg>0);assert.ok(Math.abs(a.massResidualKg)<1e-6);
  assert.equal(a.nonfiniteVanes,0);assert.ok(a.vaneCount>20);assert.ok(a.fieldResidual<1e-7);
  if(a.mouthOpen)assert.ok(Math.abs(a.unitMouthFlux-1)<1e-7,'actual mouth carries the chamber flux');
}
global.Path2D=class{rect(){}};
function paintedVanes(model){
  const shafts=[],centers=[];let path=[];
  const context={save(){},restore(){},clip(){},beginPath(){path=[];},
    moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){},fill(){},
    arc(x,y){centers.push([x,y]);},stroke(){shafts.push({path,alpha:this.globalAlpha});}};
  const vanes=model.vanes();model.draw(context,{scale:1,accent:'currentColor'});
  assert.deepEqual(model.vanes(),vanes,'drawing cannot set or alter physical angles');
  assert.equal(shafts.length,vanes.length);assert.equal(centers.length,vanes.length);
  for(let i=0;i<vanes.length;i++){
    const {path,alpha}=shafts[i],v=vanes[i];
    assert.ok(Math.hypot(path[1][0]-v.x-10*Math.cos(v.angle),path[1][1]-v.y-10*Math.sin(v.angle))<1e-9,'painter uses the integrated vane angle');
    assert.ok(Math.hypot((path[0][0]+path[1][0])/2-v.x,(path[0][1]+path[1][1])/2-v.y)<1e-9,'vane rotates around its fixed pin');
    assert.deepEqual(centers[i],[v.x,v.y]);assert.ok(alpha>=.7,'vanes stay visible at rest');
  }
}
const idle=setup(),initial=idle.model.stats(),initialVanes=idle.model.vanes();
const quiet=run(idle,60);healthy(quiet);
assert.equal(quiet.outsidePressurePa,initial.outsidePressurePa);assert.equal(quiet.massKg,initial.massKg);
assert.equal(quiet.flowM3PerSecond,0);assert.deepEqual(idle.model.vanes(),initialVanes,'no automatic breathing or turning');paintedVanes(idle.model);
const tap=setup();pump(tap,'inside');run(tap,3);
const room=tap.model.vanes().filter(v=>v.x<460),turns=room.map(v=>Math.abs(v.angle-v.restAngle)).sort((a,b)=>a-b);
assert.ok(turns[Math.floor(turns.length/2)]>Math.PI/4,'a single tap gives an obvious chamber response within three seconds');
assert.ok(turns[0]>.1,'even the slowest chamber probe visibly turns after a single tap');
const incremental=setup();
for(let i=0;i<120;i++)assert.equal(incremental.model.increasePressure('inside',4000/120),true);
assert.ok(Math.abs(incremental.model.stats().pumpedKg-4000*incremental.model.stats().volumeM3/(incremental.d.cave.gasConstant*incremental.d.cave.temperature))<1e-6,'continuous pressure additions enter the gas ledger');
assert.equal(incremental.model.increasePressure('outside',NaN),false);assert.equal(incremental.model.increasePressure('inside',-1),false);
const s=setup(),beforePump=s.model.stats(),beforeAngles=s.model.vanes();
pump(s,'inside',3);const pumped=s.model.stats();
assert.equal(pumped.outsidePressurePa,beforePump.outsidePressurePa);
assert.ok(Math.abs(pumped.pressurePa-beforePump.pressurePa-3000)<1e-8);
assert.ok(Math.abs(pumped.pumpedKg-3000*pumped.volumeM3/(s.d.cave.gasConstant*s.d.cave.temperature))<1e-8);
assert.deepEqual(s.model.vanes(),beforeAngles,'pressure inputs apply no angular impulse or angle change');
assert.equal(s.model.increasePressure('invalid'),false);
let min=0,max=0,maxRotationStep=0,reversals=0,previousSpeed=0;
for(let i=0;i<120*120;i++){
  // Tests press alternating buttons. Runtime has no clock-driven input.
  if(i && i%(6*120)===0)pump(s,(i/(6*120))%2?'outside':'inside',6);
  const old=s.model.stats(),oldVanes=s.model.vanes(),dt=1/120;s.model.tick(dt);const a=s.model.stats();healthy(a);
  min=Math.min(min,a.speedMetersPerSecond);max=Math.max(max,a.speedMetersPerSecond);
  if(previousSpeed*a.speedMetersPerSecond<0){reversals++;paintedVanes(s.model);}previousSpeed=a.speedMetersPerSecond;
  assert.equal(a.outsidePressurePa,old.outsidePressurePa,'outside pressure only changes through a manual input');
  assert.ok(Math.abs(a.pressurePa-a.massKg*s.d.cave.gasConstant*s.d.cave.temperature/a.volumeM3)<1e-7,'independent ideal-gas EOS');
  const rho=(old.pressurePa+a.outsidePressurePa)*.5/(s.d.cave.gasConstant*s.d.cave.temperature);
  const lhs=rho*s.d.cave.neckLength*(a.speedMetersPerSecond-old.speedMetersPerSecond)/dt;
  const rhs=a.gaugePressurePa-.5*rho*s.d.cave.lossCoefficient*a.speedMetersPerSecond*Math.abs(a.speedMetersPerSecond);
  assert.ok(Math.abs(lhs-rhs)<1e-6,'entrance momentum balances pressure and declared loss');
  const gate=s.d.cave.gate;let fieldFlux=0;
  for(let y=gate.y+4;y<gate.y+gate.height;y+=8)fieldFlux+=s.model.sampleVelocity(gate.x+gate.width,y).vx*8*s.d.cave.depth;
  assert.ok(Math.abs(fieldFlux*a.massKg/a.volumeM3-(old.massKg-a.massKg)/dt)<1e-5,'mouth velocity carries measured mass transfer');
  const p=s.d.cave.vane;
  for(const current of s.model.vanes()){
    const prior=oldVanes[current.id],velocity=s.model.sampleVelocity(current.x,current.y);
    const rx=p.arm*Math.cos(prior.angle),ry=p.arm*Math.sin(prior.angle);
    const ux=velocity.vx+current.omega*ry,uy=velocity.vy-current.omega*rx;
    const r=s.d.cave.chamber,inside=current.x>=r.x && current.x<r.x+r.width && current.y>=r.y && current.y<r.y+r.height;
    const density=inside?a.massKg/a.volumeM3:(current.x<s.d.pipes[0].points.at(-1).x?(a.pressurePa+a.outsidePressurePa)/2:a.outsidePressurePa)/(s.d.cave.gasConstant*s.d.cave.temperature);
    const force=.5*density*p.dragCoefficient*p.area*Math.hypot(ux,uy);
    const torque=rx*force*uy-ry*force*ux-p.bearingDrag*current.omega-p.spring*(current.angle-current.restAngle);
    assert.ok(Math.abs(p.inertia*(current.omega-prior.omega)/dt-torque)<1e-9,'independent force and angular-momentum balance');
    assert.ok(Math.abs(current.angle-prior.angle-current.omega*dt)<1e-12,'angle advances only through angular velocity');
    assert.equal(current.x,prior.x);assert.equal(current.y,prior.y);
    maxRotationStep=Math.max(maxRotationStep,Math.abs(current.angle-prior.angle));
  }
}
assert.ok(min<-5 && max>5 && reversals>=18,'manual inputs produce repeated physical reversals');
assert.ok(maxRotationStep<Math.PI/2,'no instantaneous half-turn '+JSON.stringify({maxRotationStep,min,max,reversals}));
assert.ok(s.model.stats().vaneAngularTravel>100,'vanes turn under the applied flow');
s.close(true);s.model.tick(1/120);const sealed=s.model.stats();
const energy=()=>s.model.vanes().reduce((sum,v)=>sum+.5*s.d.cave.vane.inertia*v.omega*v.omega+.5*s.d.cave.vane.spring*(v.angle-v.restAngle)**2,0);
let previousEnergy=energy();
for(let i=0;i<4*120;i++){s.model.tick(1/120);assert.ok(energy()<=previousEnergy+1e-12,'stopped airflow lets vane motion dissipate');previousEnergy=energy();}
const held=s.model.stats();healthy(held);assert.equal(held.massKg,sealed.massKg);assert.equal(held.flowM3PerSecond,0);
pump(s,'inside');const charged=s.model.stats();run(s,2);assert.equal(s.model.stats().massKg,charged.massKg,'closed chamber retains pumped air');
s.close(false);assert.notEqual(run(s,2).massKg,charged.massKg,'reopening transfers the existing charge');
const shut=setup({closed:true});pump(shut,'outside',3);const trapped=run(shut,20);healthy(trapped);
assert.equal(trapped.flowM3PerSecond,0);assert.equal(trapped.massKg,trapped.initialMassKg);
const coarse=setup(),fine=setup();pump(coarse,'outside',3);pump(fine,'outside',3);
const a=run(coarse,8,1/30),b=run(fine,8,1/120);healthy(a);healthy(b);
assert.ok(Math.abs(a.massKg-b.massKg)<1e-5 && Math.abs(a.vaneAngularTravel-b.vaneAngularTravel)<1e-5,'fixed-substep frame-size invariance');
console.log(JSON.stringify({minSpeed:min,maxSpeed:max,reversals,maxRotationStep,minTapTurnDegrees:turns[0]*180/Math.PI,medianTapTurnDegrees:turns[Math.floor(turns.length/2)]*180/Math.PI,quiet,manual:s.model.stats()},null,2));
console.log('PASS: no automatic forcing; independent gas, entrance and vane momentum; manual pressure; continuous physical rotation; closure and damping; frame-size invariance.');
