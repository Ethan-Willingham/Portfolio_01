/* Enemy hull steering, traffic clearance and deterministic fixed-buffer motion. */
const assert=require('node:assert/strict');
const B=require('../../js/widewake-battle-core.js');require('../../js/widewake-estuary-core.js');
const R=require('../../js/widewake-reach-game.js');
const dt=1/60,rand=B.random(937),delta=B.angleDelta,check=s=>console.log('PASS '+s);
function fixture(){const b=new B.Battle({population:0});b.mounts=[];b.ships.slice(1).forEach(s=>s.hp=0);b.player.x=b.player.px=700;b.player.y=b.player.py=0;b.player.vx=b.player.vy=0;b.sea=null;b.contacts={active:true};return b;}
function step(b,n){for(let k=0;k<n;k++){b.tick++;b.time+=dt;b.raiders.index();b.raiders.step(dt,b);}}
const turning=fixture(),a=turning.raiders;a.add(0,0,0,rand);step(turning,180);
const velocity=a.vx[0],angle=a.angle[0];turning.player.x=-700;step(turning,1);
assert.ok(velocity>40);assert.ok(a.vx[0]>velocity-1,'retargeting cannot reverse world momentum');assert.ok(Math.abs(delta(a.angle[0],angle))<.03);
let previous=a.angle[0],turn=a.turn[0];for(let k=0;k<160;k++){step(turning,1);assert.ok(Math.abs(delta(a.angle[0],previous))<=1.55*dt+.00001);assert.ok(Math.abs(a.turn[0]-turn)<=3.6*dt+.00001);previous=a.angle[0];turn=a.turn[0];}
assert.ok(Math.abs(delta(a.angle[0],angle))>2,'the hull turns around over time');
check('retargeting preserves momentum and uses bounded hull yaw and angular acceleration');

const gunner=fixture();gunner.player.x=350;gunner.raiders.add(0,0,2,rand);gunner.raiders.cooldown[0]=100;
let minRange=Infinity,maxRange=0,minForward=Infinity;
for(let k=0;k<1800;k++){step(gunner,1);const q=gunner.raiders,range=Math.hypot(q.x[0]-gunner.player.x,q.y[0]);if(k>240){minRange=Math.min(minRange,range);maxRange=Math.max(maxRange,range);minForward=Math.min(minForward,q.vx[0]*Math.cos(q.angle[0])+q.vy[0]*Math.sin(q.angle[0]));}}
assert.ok(minRange<140&&maxRange>320,JSON.stringify({minRange,maxRange}));assert.ok(minForward>0,'gunner keeps forward propulsion through its attack pass');assert.ok(Math.abs(gunner.raiders.y[0])>20);
check('gunners press through close attack passes and re-engage without reverse thrust');

// A test-only full pair check measures the gaps in the bounded runtime solver.
function hull(a,i){const spec=B.enemies[a.kind[i]],c=Math.cos(a.angle[i]),s=Math.sin(a.angle[i]);return B.HULL_OUTLINE.map(([x,y])=>({x:a.x[i]+x*spec.length*c-y*spec.width*s,y:a.y[i]+x*spec.length*s+y*spec.width*c}));}
function gap(p,q){let best=-Infinity;for(const shape of [p,q])for(let k=0;k<shape.length;k++){const v=shape[k],w=shape[(k+1)%shape.length],l=Math.hypot(w.x-v.x,w.y-v.y),nx=(w.y-v.y)/l,ny=(v.x-w.x)/l;let pmin=Infinity,pmax=-Infinity,qmin=Infinity,qmax=-Infinity;for(const x of p){const n=x.x*nx+x.y*ny;pmin=Math.min(pmin,n);pmax=Math.max(pmax,n);}for(const x of q){const n=x.x*nx+x.y*ny;qmin=Math.min(qmin,n);qmax=Math.max(qmax,n);}best=Math.max(best,qmin-pmax,pmin-qmax);}return best;}
function traffic(crossing){
  const b=fixture(),a=b.raiders,goals=[];b.player.x=b.player.y=0;
  for(let i=0;i<12;i++){const north=crossing&&i>=6,n=crossing?i%6:i;a.add(north?8:-140-n*24,north?-140-n*24:-8,0,rand);a.steeringReady[i]=1;a.angle[i]=a.previousAngle[i]=a.desiredAngle[i]=north?Math.PI/2:0;a.vx[i]=north?0:42;a.vy[i]=north?42:0;a.drive[i]=42;goals.push(north?{x:8,y:1500}:{x:1500,y:-8});}
  if(!crossing){a.kind[0]=2;a.drive[0]=a.vx[0]=22;}
  let minimum=Infinity,maxAvoid=0,maxContacts=0;
  for(let k=0;k<720;k++){
    a.index();a.avoidChecks=a.contactChecks=0;a.pushTravel=1;a.pushDecay=Math.exp(-B.BLAST.drag*dt);
    for(let i=0;i<a.count;i++){
      a.px[i]=a.x[i];a.py[i]=a.y[i];a.previousAngle[i]=a.angle[i];
      if((k+a.id[i])%4===0){const goal=goals[i],dx=goal.x-a.x[i],dy=goal.y-a.y[i],d=Math.hypot(dx,dy),out=a.avoid(i,dx/d,dy/d,!crossing&&i===0?22:42);a.desiredAngle[i]=Math.atan2(out.y,out.x);a.desiredSpeed[i]=out.speed;}
      a.helm(i,dt);a.move(i,dt,b);assert.ok(Math.hypot(a.x[i]-a.px[i],a.y[i]-a.py[i])<=42*dt+.001,'traffic never separates hulls by teleport');
    }
    maxAvoid=Math.max(maxAvoid,a.avoidChecks);maxContacts=Math.max(maxContacts,a.contactChecks);
    if(k%3===0){const hulls=Array.from({length:a.count},(_,i)=>hull(a,i));for(let i=0;i<a.count;i++)for(let j=0;j<i;j++)if(Math.hypot(a.x[i]-a.x[j],a.y[i]-a.y[j])<40)minimum=Math.min(minimum,gap(hulls[i],hulls[j]));}
  }
  assert.ok(minimum>-.45,JSON.stringify({crossing,minimum}));assert.ok(maxAvoid<=12*20);assert.ok(maxContacts<=12*16);
  return{minimumGap:+minimum.toFixed(3),maxAvoid,maxContacts,travel:a.x[11]+140+11*24};
}
const crossing=traffic(true),queue=traffic(false);assert.ok(crossing.travel>150&&queue.travel>100);check('twelve crossing hulls and a slower lead boat preserve physical gaps with capped local checks');console.log(JSON.stringify({crossing,queue}));

const saved=new R.Game();saved.castOff();saved.player.x=saved.player.px=0;saved.player.y=saved.player.py=2000;saved.nextEncounter=1e9;saved.mounts=[];
for(let i=0;i<8;i++)saved.raiders.add(-400-i*25,2100+i*7,i%3,rand);
for(let k=0;k<180;k++)saved.step(dt);
const text=saved.save(),restored=R.Game.restore(text);restored.mounts=[];
for(let k=0;k<180;k++){saved.step(dt);restored.step(dt);}
for(const key of ['x','y','vx','vy','angle','turn','desiredAngle','desiredSpeed','drive','steeringReady','gunAngle','fireAt','surface','surfaceReady','attackPhase','passX','passY'])assert.deepEqual(Array.from(saved.raiders[key].subarray(0,saved.raiders.count)),Array.from(restored.raiders[key].subarray(0,restored.raiders.count)),key+' survives continuation');
const old=JSON.parse(text);for(const key of ['angle','turn','desiredAngle','desiredSpeed','drive','steeringReady','gunAngle','fireAt','surface','surfaceReady'])delete old.raiders[key];assert.ok(R.Game.restore(JSON.stringify(old)));
const invalid=JSON.parse(text);invalid.raiders.angle[0]='invalid';assert.throws(()=>R.Game.restore(JSON.stringify(invalid)));
check('enemy decisions, body headings and surface caches continue deterministically and validate old records');

const active=new R.Game();active.castOff();active.player.x=active.player.px=0;active.player.y=active.player.py=2000;active.nextEncounter=1e9;active.mounts=[];
active.raiders.add(-120,2020,0,rand);for(let k=0;k<30;k++)active.step(dt);assert.equal(active.raiders.attackPhase[0],1,'save during a real committed light-boat pass');
const resumed=R.Game.restore(active.save());resumed.mounts=[];for(let k=0;k<240;k++){active.step(dt);resumed.step(dt);}
assert.equal(active.raiders.count,resumed.raiders.count);for(const key of ['x','y','vx','vy','pushX','pushY','angle','turn','drive','attackPhase','passX','passY'])assert.deepEqual(Array.from(active.raiders[key].subarray(0,active.raiders.count)),Array.from(resumed.raiders[key].subarray(0,resumed.raiders.count)),key+' continues an active light-boat pass');
assert.equal(active.player.hp,resumed.player.hp);check('a saved light-boat attack continues through hull contact with identical motion and damage');

const stress=fixture();stress.player.x=stress.player.px=0;stress.player.y=stress.player.py=0;
for(let i=0;i<16384;i++){const angle=i*.61803398875*2*Math.PI,radius=350+(i%2400);stress.raiders.add(Math.cos(angle)*radius,Math.sin(angle)*radius,i%3,rand);}
const bytes=stress.memoryBytes(),start=performance.now();let maxAvoid=0,maxContacts=0;
for(let k=0;k<90;k++){step(stress,1);maxAvoid=Math.max(maxAvoid,stress.raiders.avoidChecks);maxContacts=Math.max(maxContacts,stress.raiders.contactChecks);}
for(const key of ['x','y','vx','vy','angle','previousAngle','turn','drive','surface'])for(const value of stress.raiders[key])assert.ok(Number.isFinite(value),key+' stays finite');
assert.equal(stress.memoryBytes(),bytes);assert.ok(maxAvoid>0&&maxAvoid<=16384*20);assert.ok(maxContacts>0&&maxContacts<=16384*16);
check('16,384 enemies retain finite fixed buffers and bounded crowd work');console.log(JSON.stringify({milliseconds:Math.round(performance.now()-start),maxAvoid,maxContacts,bufferBytes:bytes}));
