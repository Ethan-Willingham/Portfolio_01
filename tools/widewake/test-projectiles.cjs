/* Physical contacts, real hull damage, missed shots and visual-budget independence. */
const assert=require('node:assert/strict');
const B=require('../../js/widewake-battle-core.js'),E=require('../../js/widewake-estuary-core.js'),R=require('../../js/widewake-reach-game.js');
const dt=1/60,r=B.random(27),close=(a,b)=>assert.ok(Math.abs(a-b)<.002,`${a} != ${b}`);
const fixture=()=>{const b=new B.Battle({population:0});b.mounts=[];return b;};
function enemy(b,x,y,kind=0,angle=0,hp=1000){const a=b.raiders;a.add(x,y,kind,r);const i=a.count-1;a.hp[i]=hp;a.vx[i]=Math.cos(angle);a.vy[i]=Math.sin(angle);a.index();return i;}
function fire(b,x,y,tx,ty,spec={...B.weapons.guard,speed:6000}){assert.ok(b.shots.fire(x,y,tx,ty,spec));}

// A visible bow or stern counts at every orientation, not just the centre disk.
for(let kind=0;kind<4;kind++)for(let n=0;n<16;n++)for(const along of [-.44,.44]){
  const b=fixture(),spec=B.enemies[kind],angle=n*Math.PI/8,c=Math.cos(angle),s=Math.sin(angle);
  const x=spec.length*along,from={x:200+c*x+s*spec.width*2,y:100+s*x-c*spec.width*2},to={x:200+c*x-s*spec.width*2,y:100+s*x+c*spec.width*2};
  enemy(b,200,100,kind,angle);fire(b,from.x,from.y,to.x,to.y,{...B.weapons.guard,speed:spec.width*4/dt});b.shots.step(dt,b);
  close(b.raiders.hp[0],970);assert.equal(b.shots.contacts,1);assert.equal(b.shots.count,0);
}
const miss=fixture();enemy(miss,50,0);fire(miss,0,20,100,20);miss.shots.step(dt,miss);assert.equal(miss.raiders.hp[0],1000);assert.equal(miss.shots.contacts,0);assert.equal(miss.shots.count,1);
const lethal=fixture();enemy(lethal,30,0,0,0,1);fire(lethal,0,0,100,0,{...B.weapons.guard,speed:6000,damage:1000});lethal.shots.step(dt,lethal);assert.equal(lethal.kills,1,'lethal damage cannot accidentally equal the already-sunk sentinel');assert.equal(lethal.raiders.dead,1);
console.log('PASS bow/stern hits on four silhouettes at 16 headings; clean water misses do no damage');

const moving=fixture();enemy(moving,50,20,1,Math.PI/2);moving.raiders.py[0]=-20;moving.raiders.index();fire(moving,0,0,100,0);moving.shots.step(dt,moving);close(moving.raiders.hp[0],970);
const ordered=fixture();enemy(ordered,40,0,0,Math.PI/2);enemy(ordered,50,0,3);fire(ordered,0,0,100,0);ordered.shots.step(dt,ordered);close(ordered.raiders.hp[0],1000);close(ordered.raiders.hp[1],970);
const pierce=fixture();enemy(pierce,30,0,2);enemy(pierce,60,0,2);enemy(pierce,90,0,2);fire(pierce,17,0,150,0,{...B.weapons.gun,speed:120});for(let n=0;n<45;n++)pierce.shots.step(dt,pierce);close(pierce.raiders.hp[0],968);close(pierce.raiders.hp[1],968);close(pierce.raiders.hp[2],1000);assert.equal(pierce.shots.contacts,2);assert.equal(pierce.shots.count,0);
console.log('PASS crossing boats are swept in relative motion; first hull contact wins; piercing never repeats a hit');

const flak=fixture();enemy(flak,30,0,2);enemy(flak,44,15);enemy(flak,100,0);fire(flak,0,0,200,0,{...B.weapons.flak,speed:6000,splash:40});flak.shots.step(dt,flak);close(flak.raiders.hp[0],940);close(flak.raiders.hp[1],961);close(flak.raiders.hp[2],1000);assert.equal(flak.shots.detonations,1);assert.equal(flak.shots.blastHits,1);assert.ok(flak.effects.x[0]<30,'explosion stays on contact, not the end of a fast simulation step');
const mortar=fixture();enemy(mortar,50,0);enemy(mortar,200,0);fire(mortar,0,0,200,0,B.weapons.mortar);
for(let n=0;n<30;n++)mortar.shots.step(dt,mortar);assert.equal(mortar.raiders.hp[0],1000);assert.equal(mortar.raiders.hp[1],1000);assert.ok(mortar.shots.height[0]>50,'shells do not hit boats they fly above');
for(let n=0;n<60;n++)mortar.shots.step(dt,mortar);close(mortar.raiders.hp[0],1000);close(mortar.raiders.hp[1],865);assert.equal(mortar.shots.contacts,1);assert.equal(mortar.shots.detonations,1);assert.equal(mortar.shots.count,0);
console.log('PASS flak detonates on contact without double damage; mortars travel, clear boats aloft and strike decks');

const hostile=fixture();for(const s of hostile.ships)s.hp=0;
for(const [i,x]of [[0,100],[1,40]])Object.assign(hostile.ships[i],{x,px:x,y:0,py:0,angle:0,previousAngle:0,hp:1000});
fire(hostile,0,0,200,0,{...B.weapons.hostile,speed:12000});hostile.shots.step(dt,hostile);close(hostile.ships[1].hp,987);close(hostile.ships[0].hp,1000);assert.equal(hostile.shots.hostile,0);
const crossing=fixture();crossing.ships.forEach(s=>s.hp=0);Object.assign(crossing.player,{x:50,px:50,y:80,py:-80,angle:Math.PI/2,previousAngle:Math.PI/2,hp:1000});fire(crossing,0,0,100,0,{...B.weapons.hostile,speed:6000});crossing.shots.step(dt,crossing);close(crossing.player.hp,987);
const land=fixture();enemy(land,25,0);land.clearShot=(x,y,tx)=>tx<40;fire(land,0,0,100,0);land.shots.step(dt,land);close(land.raiders.hp[0],970,'a boat before the bank is hit');
const blocked=fixture();enemy(blocked,55,0);blocked.clearShot=(x,y,tx)=>tx<40;fire(blocked,0,0,100,0);blocked.shots.step(dt,blocked);close(blocked.raiders.hp[0],1000);assert.equal(blocked.shots.count,0);
console.log('PASS hostile rounds hit the first moving friendly hull; banks block rounds after earlier contacts');

const crowded=fixture();enemy(crowded,50,0,3,0,100000);for(let n=0;n<B.LIMITS.effects;n++)crowded.effects.add(0,0,1);crowded.impactBudget=1000;crowded.soundBudget=1000;
for(let n=0;n<600;n++)fire(crowded,0,0,100,0);crowded.shots.step(dt,crowded);close(crowded.raiders.hp[0],100000-600*30);assert.equal(crowded.shots.contacts,600);assert.equal(crowded.shots.count,0);assert.equal(crowded.effects.count,B.LIMITS.effects);
console.log('PASS all 600 simultaneous hits deal damage even with full effects and exhausted sound/impact budgets');

const save=new R.Game();save.castOff();save.shots.fire(0,2000,200,2000,B.weapons.mortar);save.shots.step(dt,save);const text=save.save(),restored=R.Game.restore(text);close(restored.shots.startHeight[0],save.shots.startHeight[0]);
for(let n=0;n<15;n++){save.shots.step(dt,save);restored.shots.step(dt,restored);}close(restored.shots.height[0],save.shots.height[0]);
const legacy=JSON.parse(text);delete legacy.shots.startHeight;assert.ok(R.Game.restore(JSON.stringify(legacy)));legacy.shots.startHeight=['bad'];assert.throws(()=>R.Game.restore(JSON.stringify(legacy)));
console.log('PASS shell trajectories survive voyage saves; earlier saves remain readable and invalid heights are rejected');
