/* Parked pure snapshots retain physical flight without enabling browser saves. */
const assert=require('node:assert/strict');
const B=require('../../js/widewake-battle-core.js');require('../../js/widewake-estuary-core.js');const R=require('../../js/widewake-reach-game.js');
const g=new R.Game();g.castOff();g.sea.strength=0;
g.shots.fire(0,2000,300,2000,B.weapons.guard,0,0,600,4,1.2,{vx:18,vy:0});
g.shots.step(1/60,g);const text=g.save(),copy=R.Game.restore(text);
for(const key of ['verticalSpeed','targetHeight','startHeight','height','vx','vy'])assert.equal(copy.shots[key][0],g.shots[key][0],key);
for(let i=0;i<8;i++){g.shots.step(1/60,g);copy.shots.step(1/60,copy);}
assert.equal(copy.shots.count,g.shots.count);for(const key of ['height','x','y','verticalSpeed'])assert.equal(copy.shots[key][0],g.shots[key][0],key+' continuation');
const older=JSON.parse(text);delete older.shots.verticalSpeed;delete older.shots.targetHeight;assert.ok(R.Game.restore(JSON.stringify(older)));
const partial=JSON.parse(text);delete partial.shots.targetHeight;assert.throws(()=>R.Game.restore(JSON.stringify(partial)));
const bad=JSON.parse(text);bad.shots.verticalSpeed[0]='bad';assert.throws(()=>R.Game.restore(JSON.stringify(bad)));
const negative=new R.Game();negative.shots.fire(0,2000,300,2000,B.weapons.guard,0,0,600,-.3,-1);assert.equal(R.Game.restore(negative.save()).shots.startHeight[0],negative.shots.startHeight[0]);
g.mounts[0].angle=-1.5;g.mounts[0].desiredAngle=2;g.mounts[0].cooldown=.15;const turret=R.Game.restore(g.save());assert.equal(turret.mounts[0].desiredAngle,2);assert.equal(turret.mounts[0].angle,-1.5);
console.log('PASS exact projectile trajectory continuation, wave-relative heights, optional legacy defaults and invalid field rejection');
