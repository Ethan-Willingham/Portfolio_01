/* Water pressure changes motion, survives saves, and stays local and bounded. */
const assert=require('node:assert/strict');
const B=require('../../js/widewake-battle-core.js');
require('../../js/widewake-estuary-core.js');
const R=require('../../js/widewake-reach-game.js');
const dt=1/60,rand=B.random(9),check=s=>console.log('PASS '+s);
const close=(a,b,tolerance=.001)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
function empty(){const b=new B.Battle({population:0});b.mounts=[];b.burstCooldown=999;return b;}

const b=empty(),a=b.raiders;
for(const [x,y,kind]of [[30,0,0],[0,-30,0],[30,0,3],[125,0,0],[141,0,0],[0,0,0]])a.add(x,y,kind,rand);
a.index();const positions=Array.from(a.x.subarray(0,a.count));a.blast(0,0,100,10,b,Math.PI/2);
assert.deepEqual(Array.from(a.x.subarray(0,a.count)),positions,'force does not invalidate the collision grid');
assert.equal(a.hp[0],14);assert.equal(a.hp[3],24);assert.equal(a.hp[4],24);
assert.ok(a.pushX[0]>60&&a.pushY[1]<-60);close(a.pushX[2]/a.pushX[0],.32);
assert.ok(a.pushX[3]>0&&a.pushX[3]<a.pushX[0]);assert.equal(a.pushX[4],0);
close(a.pushX[5],0);assert.ok(a.pushY[5]>90,'exact center uses the incoming heading');
assert.equal(b.effects.kind[0],3);close(b.effects.size[0],140);
check('radial pressure, hull resistance, nonlethal shoulder and a finite center hit');

const lethal=empty();lethal.raiders.add(10,0,0,rand);lethal.raiders.index();lethal.raiders.blast(0,0,100,100,lethal);assert.equal(lethal.kills,1);assert.equal(lethal.raiders.pushX[0],0);lethal.raiders.blast(0,0,100,100,lethal);assert.equal(lethal.kills,1);
for(const explosive of [false,true]){
  const hit=empty();hit.raiders.add(20,0,3,rand);hit.raiders.index();
  const hits=hit.raiders.segment(0,0,100,0,explosive?1.12:.7),contact=hit.raiders.hitDistances[0]*100;assert.equal(hits,1);assert.ok(contact>0&&contact<20);
  hit.shots.fire(0,0,100,0,{...(explosive?B.weapons.flak:B.weapons.gun),damage:1,speed:6000,pierce:1});hit.shots.step(dt,hit);
  assert.equal(hit.shots.count,0);assert.equal(hit.raiders.pushX[0]>0,explosive);
  const water=Array.from(hit.effects.kind.subarray(0,hit.effects.count)).indexOf(3);
  if(explosive){assert.ok(water>=0);close(hit.effects.x[water],contact);assert.equal(hit.raiders.hp[0],1799,'direct target takes damage once and still drifts');assert.equal(hit.shots.blastHits,0);}else assert.equal(water,-1);
}
for(const spec of [B.weapons.mortar,B.weapons.flak]){
  const miss=empty();miss.shots.fire(0,0,100,0,spec,0,0,100);
  for(let n=0;n<1000&&miss.shots.count;n++)miss.shots.step(dt,miss);
  assert.equal(miss.shots.count,0);assert.equal(miss.effects.count,1);assert.equal(miss.effects.kind[0],3);close(miss.effects.height[0],.2);assert.equal(miss.shots.detonations,1);close(miss.effects.x[0],100,.01);
}
check('lethal hits reward once, bullets do not shove, shells use swept contact and misses splash');

const pushed=empty(),control=empty();
for(const game of [pushed,control]){game.player.x=-1000;game.player.y=0;game.raiders.add(80,0,2,rand);game.raiders.index();}
pushed.raiders.blast(0,0,100,1,pushed);const initial=pushed.raiders.pushX[0];
for(let tick=0;tick<60;tick++)for(const game of [pushed,control]){game.tick++;game.raiders.step(dt,game);game.raiders.index();}
close(pushed.raiders.x[0]-control.raiders.x[0],initial*(1-Math.exp(-B.BLAST.drag))/B.BLAST.drag,.02);
close(pushed.raiders.pushX[0],initial*Math.exp(-B.BLAST.drag));
for(let tick=0;tick<240;tick++){pushed.tick++;pushed.raiders.step(dt,pushed);}
assert.equal(pushed.raiders.pushX[0],0);
for(let n=0;n<100;n++)a.blast(0,0,100,0,b);
assert.ok(Math.hypot(a.pushX[0],a.pushY[0])<=B.BLAST.maxSpeed+.001);
const savedPush=a.pushY[5];a.hp[0]=0;a.compact();close(a.pushY[0],savedPush);a.add(5,5,0,rand);assert.equal(a.pushX[a.count-1],0);assert.equal(a.pushY[a.count-1],0);
check('steering cannot erase pressure, drag integrates smoothly, stacked blasts and reused slots stay bounded');

const ram=empty();ram.ships=ram.ships.slice(0,1);ram.player.x=-1000;ram.raiders.add(0,0,3,rand);ram.raiders.charge[0]=.9;ram.raiders.chargeX[0]=-1;ram.raiders.index();ram.raiders.blast(0,-30,100,1,ram);ram.raiders.step(dt,ram);assert.ok(ram.raiders.y[0]>0);assert.equal(ram.raiders.chargeX[0],-1);assert.equal(ram.raiders.chargeY[0],0);
const shore=new R.Game();let bank;
for(let x=-1500;x<1500&&!bank;x+=2)if(shore.enemyWater(x,-2200)&&!shore.enemyWater(x+3,-2200))bank={x,y:-2200};
assert.ok(bank);shore.raiders.add(bank.x,bank.y,0,rand);shore.raiders.pushX[0]=140;shore.raiders.pushDecay=Math.exp(-B.BLAST.drag*dt);shore.raiders.pushTravel=(1-shore.raiders.pushDecay)/(B.BLAST.drag*dt);shore.raiders.vx[0]=100;shore.raiders.move(0,dt,shore);assert.equal(shore.raiders.x[0],bank.x);assert.equal(shore.raiders.pushX[0],0);
const sheltered=empty();sheltered.clearShot=()=>false;sheltered.raiders.add(10,0,0,rand);sheltered.raiders.index();sheltered.raiders.blast(0,0,100,100,sheltered);assert.equal(sheltered.raiders.hp[0],24);assert.equal(sheltered.raiders.pushX[0],0);
check('rams drift without homing; banks stop the shove and block blast pressure');

const game=new R.Game();game.castOff();game.raiders.add(300,2500,2,rand);game.raiders.index();game.raiders.blast(280,2480,100,1,game);
const text=game.save(),restored=R.Game.restore(text);assert.equal(restored.raiders.pushX[0],game.raiders.pushX[0]);assert.equal(restored.raiders.pushY[0],game.raiders.pushY[0]);
for(let n=0;n<120;n++){game.step(dt);restored.step(dt);}
for(const key of ['x','y','vx','vy','pushX','pushY','hp'])assert.deepEqual(restored.raiders[key],game.raiders[key]);
const legacy=JSON.parse(text);delete legacy.raiders.pushX;delete legacy.raiders.pushY;assert.equal(R.Game.restore(JSON.stringify(legacy)).raiders.pushX[0],0);
for(const mutate of [d=>delete d.raiders.pushY,d=>d.raiders.pushX[0]=null,d=>d.raiders.pushY[0]=1e6,d=>{d.raiders.pushX[0]=140;d.raiders.pushY[0]=140;}]){const bad=JSON.parse(text);mutate(bad);assert.throws(()=>R.Game.restore(JSON.stringify(bad)));}
check('active drift resumes exactly; old saves load with zero drift and invalid vectors are rejected');

const stress=empty(),r=B.random(93);for(let i=0;i<B.LIMITS.raiders;i++)stress.raiders.add((r()-.5)*6000,(r()-.5)*6000,i%4,r);stress.raiders.index();
let expected=0;for(let i=0;i<stress.raiders.count;i++)if(Math.hypot(stress.raiders.x[i],stress.raiders.y[i])<100*B.BLAST.reach)expected++;
const bytes=stress.memoryBytes();stress.raiders.blast(0,0,100,0,stress);let affected=0;for(let i=0;i<stress.raiders.count;i++)if(stress.raiders.pushX[i]||stress.raiders.pushY[i])affected++;
assert.equal(affected,expected);for(let n=0;n<4096;n++)stress.raiders.blast(5000,5000,100,1,stress);assert.equal(stress.effects.count,B.LIMITS.effects);assert.equal(stress.memoryBytes(),bytes);
check('32,768-hull spatial query matches brute force; sustained effects never grow their buffers');
