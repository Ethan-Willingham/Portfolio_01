// Independent inventory, momentum/EOS and real-geometry controls.
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
  return {model,d,close:value=>{closed=value;version++;}};
}
function run(s,seconds,dt=1/60){for(let t=0;t<seconds-1e-9;t+=dt)s.model.tick(dt);return s.model.stats();}
function healthy(a){
  assert.equal(a.error,null);assert.ok(a.massKg>0);assert.ok(Math.abs(a.massResidualKg)<1e-6);
  assert.ok(Math.abs(a.smokeResidual)<1e-7);assert.ok(a.minimumSmoke>=-1e-14);assert.ok(a.fieldResidual<1e-7);if(a.mouthOpen)assert.ok(Math.abs(a.unitMouthFlux-1)<1e-7,'actual entrance carries the integrated chamber flux');
}
const s=setup();const start=s.model.stats();healthy(start);
let min=0,max=0;
for(let i=0;i<48*60;i++){
  const before=s.model.stats();s.model.tick(1/60);const a=s.model.stats();
  min=Math.min(min,a.speedMetersPerSecond);max=Math.max(max,a.speedMetersPerSecond);healthy(a);
  assert.ok(Math.abs(a.pressurePa-a.massKg*s.d.cave.gasConstant*s.d.cave.temperature/a.volumeM3)<1e-7,'independent ideal-gas inventory EOS');
  if(i===120){
    // One exact internal substep checks the discretized entrance momentum.
    const old=s.model.stats(),dt=1/120;s.model.tick(dt);const n=s.model.stats();
    const rho=(n.escapedKg>old.escapedKg?old.pressurePa:n.outsidePressurePa)/(s.d.cave.gasConstant*s.d.cave.temperature);
    const lhs=rho*s.d.cave.neckLength*(n.speedMetersPerSecond-old.speedMetersPerSecond)/dt;
    const rhs=n.gaugePressurePa-.5*rho*s.d.cave.lossCoefficient*n.speedMetersPerSecond*Math.abs(n.speedMetersPerSecond);
    assert.ok(Math.abs(lhs-rhs)<1e-6,'entrance momentum uses current pressure and declared loss');
  }
}
assert.ok(min<-5 && max>5,'weather produces both flow directions');
const moving=s.model.stats();s.close(true);s.model.tick(1/60);const sealed=s.model.stats();run(s,24);
const held=s.model.stats();healthy(held);assert.equal(held.massKg,sealed.massKg);assert.equal(held.smokeAmount,sealed.smokeAmount);assert.equal(held.flowM3PerSecond,0);
assert.equal(held.pressurePa,sealed.pressurePa);assert.notEqual(held.outsidePressurePa,sealed.outsidePressurePa);
s.close(false);const reopened=run(s,3);healthy(reopened);assert.ok(reopened.massKg!==held.massKg,'reopening transfers the existing charge');
const steady=setup({steady:true});const quiet=run(steady,48);healthy(quiet);assert.equal(quiet.massKg,quiet.initialMassKg);assert.equal(quiet.flowM3PerSecond,0);assert.equal(quiet.smokeAmount,quiet.initialSmokeAmount);
const shut=setup({closed:true});const trapped=run(shut,48);healthy(trapped);assert.equal(trapped.flowM3PerSecond,0);assert.equal(trapped.massKg,trapped.initialMassKg);
const coarse=setup(),fine=setup();const a=run(coarse,8,1/30),b=run(fine,8,1/120);healthy(a);healthy(b);
assert.ok(Math.abs(a.massKg-b.massKg)<1e-5 && Math.abs(a.smokeAmount-b.smokeAmount)<1e-5,'frame-size independent fixed substeps');
console.log(JSON.stringify({minSpeed:min,maxSpeed:max,moving,sealed:held,reopened,steady:quiet},null,2));
console.log('PASS: reversing pressure drive, independent EOS/momentum, finite gas and smoke, closure/reopening, steady and closed controls, frame-size invariance.');
